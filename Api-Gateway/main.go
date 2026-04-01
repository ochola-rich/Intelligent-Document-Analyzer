package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os" // Added to access Environment Variables
	"sync"
	"time"
)

// Global or Struct-based Config
var (
	wordServiceURL = getEnv("WORD_SERVICE_URL", "http://localhost:9001/upload")
	pdfServiceURL  = getEnv("PDF_SERVICE_URL", "http://localhost:9002/upload")
	searchServiceURL = getEnv("SEARCH_SERVICE_URL", "http://localhost:8081/search")
)

type Document struct {
	ID        int64  `json:"id"`
	Filename  string `json:"filename"`
	Status    string `json:"status"`
	SizeBytes int64  `json:"sizeBytes"`
	Date      string `json:"date"`
}

var (
	documentsMu sync.Mutex
	documents   []Document
)

// Helper to get env or return a default
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
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

	// 1. Get the dynamic URL based on file type
	targetURL := Getmurl(file)

	// 2. Forward as multipart to preserve filename and content type
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", header.Filename)
	if err != nil {
		log.Printf("Error creating multipart part: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if _, err := io.Copy(part, file); err != nil {
		log.Printf("Error copying file: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := writer.Close(); err != nil {
		log.Printf("Error closing multipart writer: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	req, err := http.NewRequest("POST", targetURL, &body)
	if err != nil {
		log.Printf("Error creating request: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error forwarding to %s: %v", targetURL, err)
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()

	fmt.Printf("Forwarded to %s | Status: %s\n", targetURL, resp.Status)
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write([]byte("File processed"))

	docStatus := "failed"
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		docStatus = "processed"
	}

	documentsMu.Lock()
	documents = append([]Document{
		{
			ID:        time.Now().UnixNano(),
			Filename:  header.Filename,
			Status:    docStatus,
			SizeBytes: header.Size,
			Date:      time.Now().Format("2006-01-02"),
		},
	}, documents...)
	documentsMu.Unlock()
}

func Getmurl(file multipart.File) string {
	buf := make([]byte, 512)
	_, _ = file.Read(buf)
	_, _ = file.Seek(0, io.SeekStart)
	filetype := http.DetectContentType(buf)

	// Use our environment-based variables here
	switch filetype {
	case "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		return wordServiceURL
	default:
		return pdfServiceURL
	}
}

// ... HandleHealth and main remain similar ...
func HandleHealth(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
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

	req, err := http.NewRequest("POST", searchServiceURL, bytes.NewReader(body))
	if err != nil {
		http.Error(w, "failed to create request", http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
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

	documentsMu.Lock()
	payload := make([]Document, len(documents))
	copy(payload, documents)
	documentsMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

func main() {
	http.HandleFunc("/upload", HandleUpload)
	http.HandleFunc("/search", handlesearch)
	http.HandleFunc("/documents", HandleDocuments)
	http.HandleFunc("/health", HandleHealth)
	log.Println("Starting server on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
