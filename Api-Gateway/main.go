package main

import (
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os" // Added to access Environment Variables
)

// Global or Struct-based Config
var (
	wordServiceURL = getEnv("WORD_SERVICE_URL", "http://localhost:9001/upload")
	pdfServiceURL  = getEnv("PDF_SERVICE_URL", "http://localhost:9002/upload")
)

// Helper to get env or return a default
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func HandleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// 1. Get the dynamic URL based on file type
	targetURL := Getmurl(file)

	// 2. Forward the request (Simplified for clarity)
	req, err := http.NewRequest("POST", targetURL, file)
	if err != nil {
		log.Printf("Error creating request: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

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
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func main() {
	http.HandleFunc("/upload", HandleUpload)
	http.HandleFunc("/health", HandleHealth)
	log.Println("Starting server on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}