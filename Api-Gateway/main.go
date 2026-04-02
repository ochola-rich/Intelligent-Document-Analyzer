package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	wordServiceURL    = getEnv("WORD_SERVICE_URL", "http://localhost:8081/upload")
	pdfServiceURL     = getEnv("PDF_SERVICE_URL", "http://localhost:8081/upload")
	searchServiceURL  = getEnv("SEARCH_SERVICE_URL", "http://localhost:8081/search")
	jobServiceBaseURL = getEnv("JOB_SERVICE_BASE_URL", strings.TrimSuffix(searchServiceURL, "/search"))
)

type Document struct {
	ID        int64  `json:"id"`
	Filename  string `json:"filename"`
	Status    string `json:"status"`
	SizeBytes int64  `json:"sizeBytes"`
	Date      string `json:"date"`
}

type storedDocument struct {
	Document
	JobID      string
	StoredPath string
}

type UploadResponse struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Filename  string `json:"filename"`
	CreatedAt string `json:"created_at"`
}

type JobStatusResponse struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	Error       string `json:"error"`
	CompletedAt string `json:"completed_at"`
}

type DeleteResponse struct {
	DeletedRows int `json:"deleted_rows"`
}

var (
	documentsMu sync.Mutex
	documents   []storedDocument
)

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func detectTargetURL(content []byte) string {
	sniffLen := min(len(content), 512)
	filetype := http.DetectContentType(content[:sniffLen])

	switch filetype {
	case "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		return wordServiceURL
	default:
		return pdfServiceURL
	}
}

func createStoredUpload(filename string, content []byte) (string, error) {
	safeName := filepath.Base(filename)
	tmpFile, err := os.CreateTemp("", fmt.Sprintf("ida-upload-*-%s", safeName))
	if err != nil {
		return "", err
	}
	defer tmpFile.Close()

	if _, err := tmpFile.Write(content); err != nil {
		_ = os.Remove(tmpFile.Name())
		return "", err
	}

	return tmpFile.Name(), nil
}

func forwardUpload(targetURL, filename string, content []byte) ([]byte, int, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, 0, err
	}
	if _, err := part.Write(content); err != nil {
		return nil, 0, err
	}
	if err := writer.Close(); err != nil {
		return nil, 0, err
	}

	req, err := http.NewRequest(http.MethodPost, targetURL, &body)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}

	return responseBody, resp.StatusCode, nil
}

func storeDocument(doc storedDocument) {
	documentsMu.Lock()
	defer documentsMu.Unlock()
	documents = append([]storedDocument{doc}, documents...)
}

func getDocumentByID(id int64) (storedDocument, int, bool) {
	documentsMu.Lock()
	defer documentsMu.Unlock()

	for index, doc := range documents {
		if doc.ID == id {
			return doc, index, true
		}
	}

	return storedDocument{}, -1, false
}

func setDocumentUploadState(documentID int64, status, jobID string) bool {
	documentsMu.Lock()
	defer documentsMu.Unlock()

	for index := range documents {
		if documents[index].ID == documentID {
			documents[index].Status = status
			documents[index].JobID = jobID
			documents[index].Date = time.Now().Format("2006-01-02")
			return true
		}
	}

	return false
}

func removeDocumentByID(documentID int64) (storedDocument, bool) {
	documentsMu.Lock()
	defer documentsMu.Unlock()

	for index, doc := range documents {
		if doc.ID == documentID {
			documents = append(documents[:index], documents[index+1:]...)
			return doc, true
		}
	}

	return storedDocument{}, false
}

func listDocuments() []Document {
	documentsMu.Lock()
	defer documentsMu.Unlock()

	payload := make([]Document, len(documents))
	for index, doc := range documents {
		payload[index] = doc.Document
	}
	return payload
}

func uploadToProcessingService(filename string, content []byte) ([]byte, int, string, string, error) {
	targetURL := detectTargetURL(content)
	responseBody, statusCode, err := forwardUpload(targetURL, filename, content)
	if err != nil {
		return nil, 0, targetURL, "", err
	}

	docStatus := "failed"
	if statusCode >= 200 && statusCode < 300 {
		docStatus = "processed"
	}

	var uploadPayload UploadResponse
	if err := json.Unmarshal(responseBody, &uploadPayload); err == nil {
		if uploadPayload.Status != "" {
			docStatus = uploadPayload.Status
		}
	}

	return responseBody, statusCode, targetURL, docStatus, nil
}

func respondJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}

func HandleUpload(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "failed to read upload", http.StatusBadRequest)
		return
	}

	storedPath, err := createStoredUpload(header.Filename, content)
	if err != nil {
		log.Printf("Error staging upload %s: %v", header.Filename, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	responseBody, statusCode, targetURL, docStatus, err := uploadToProcessingService(header.Filename, content)
	if err != nil {
		log.Printf("Error forwarding to processing service: %v", err)
		_ = os.Remove(storedPath)
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	var uploadPayload UploadResponse
	_ = json.Unmarshal(responseBody, &uploadPayload)

	doc := storedDocument{
		Document: Document{
			ID:        time.Now().UnixNano(),
			Filename:  header.Filename,
			Status:    docStatus,
			SizeBytes: header.Size,
			Date:      time.Now().Format("2006-01-02"),
		},
		JobID:      uploadPayload.ID,
		StoredPath: storedPath,
	}
	storeDocument(doc)

	if uploadPayload.ID != "" && (docStatus == "queued" || docStatus == "processing") {
		go watchJobStatus(doc.ID, uploadPayload.ID)
	}

	log.Printf("Forwarded %s to %s | Status: %d", header.Filename, targetURL, statusCode)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, _ = w.Write(responseBody)
}

func HandleHealth(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handlesearch(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request", http.StatusBadRequest)
		return
	}

	req, err := http.NewRequest(http.MethodPost, searchServiceURL, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "failed to create request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("Error forwarding to %s: %v", searchServiceURL, err)
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func HandleDocuments(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	respondJSON(w, http.StatusOK, listDocuments())
}

func HandleDocumentAction(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/documents/")
	path = strings.Trim(path, "/")
	if path == "" {
		http.NotFound(w, r)
		return
	}

	parts := strings.Split(path, "/")
	documentID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		http.Error(w, "invalid document id", http.StatusBadRequest)
		return
	}

	switch {
	case len(parts) == 2 && parts[1] == "retry" && r.Method == http.MethodPost:
		handleRetryDocument(w, documentID)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		handleDeleteDocument(w, documentID)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleRetryDocument(w http.ResponseWriter, documentID int64) {
	doc, _, ok := getDocumentByID(documentID)
	if !ok {
		http.Error(w, "document not found", http.StatusNotFound)
		return
	}
	if doc.Status == "processing" || doc.Status == "queued" {
		http.Error(w, "document is already processing", http.StatusConflict)
		return
	}
	if doc.StoredPath == "" {
		http.Error(w, "no staged upload available for retry", http.StatusConflict)
		return
	}

	content, err := os.ReadFile(doc.StoredPath)
	if err != nil {
		http.Error(w, "staged upload is no longer available", http.StatusGone)
		return
	}

	responseBody, statusCode, targetURL, docStatus, err := uploadToProcessingService(doc.Filename, content)
	if err != nil {
		log.Printf("Error retrying %s to processing service: %v", doc.Filename, err)
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	var uploadPayload UploadResponse
	_ = json.Unmarshal(responseBody, &uploadPayload)
	setDocumentUploadState(documentID, docStatus, uploadPayload.ID)

	if uploadPayload.ID != "" && (docStatus == "queued" || docStatus == "processing") {
		go watchJobStatus(documentID, uploadPayload.ID)
	}

	log.Printf("Retried %s to %s | Status: %d", doc.Filename, targetURL, statusCode)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, _ = w.Write(responseBody)
}

func handleDeleteDocument(w http.ResponseWriter, documentID int64) {
	doc, _, ok := getDocumentByID(documentID)
	if !ok {
		http.Error(w, "document not found", http.StatusNotFound)
		return
	}
	if doc.Status == "processing" || doc.Status == "queued" {
		http.Error(w, "cannot delete a document while processing", http.StatusConflict)
		return
	}

	deleteURL := fmt.Sprintf("%s/documents/%s", jobServiceBaseURL, url.PathEscape(doc.Filename))
	req, err := http.NewRequest(http.MethodDelete, deleteURL, nil)
	if err != nil {
		http.Error(w, "failed to create delete request", http.StatusInternalServerError)
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("Error deleting %s from processing service: %v", doc.Filename, err)
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		http.Error(w, string(body), resp.StatusCode)
		return
	}

	removedDoc, removed := removeDocumentByID(documentID)
	if !removed {
		http.Error(w, "document not found", http.StatusNotFound)
		return
	}
	if removedDoc.StoredPath != "" {
		_ = os.Remove(removedDoc.StoredPath)
	}

	var upstreamPayload DeleteResponse
	if err := json.NewDecoder(resp.Body).Decode(&upstreamPayload); err != nil {
		upstreamPayload = DeleteResponse{}
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"id":           removedDoc.ID,
		"filename":     removedDoc.Filename,
		"deleted_rows": upstreamPayload.DeletedRows,
	})
}

func watchJobStatus(documentID int64, jobID string) {
	client := &http.Client{Timeout: 10 * time.Second}
	jobURL := fmt.Sprintf("%s/jobs/%s", jobServiceBaseURL, jobID)

	for attempt := 0; attempt < 120; attempt++ {
		resp, err := client.Get(jobURL)
		if err != nil {
			log.Printf("Error polling job %s: %v", jobID, err)
			time.Sleep(5 * time.Second)
			continue
		}

		var job JobStatusResponse
		decodeErr := json.NewDecoder(resp.Body).Decode(&job)
		resp.Body.Close()
		if decodeErr != nil {
			log.Printf("Error decoding job %s: %v", jobID, decodeErr)
			time.Sleep(5 * time.Second)
			continue
		}

		setDocumentUploadState(documentID, job.Status, jobID)

		if job.Status == "processed" || job.Status == "failed" {
			return
		}

		time.Sleep(5 * time.Second)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	port := getEnv("PORT", "8080")

	http.HandleFunc("/upload", HandleUpload)
	http.HandleFunc("/search", handlesearch)
	http.HandleFunc("/documents", HandleDocuments)
	http.HandleFunc("/documents/", HandleDocumentAction)
	http.HandleFunc("/health", HandleHealth)
	log.Printf("Starting server on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
