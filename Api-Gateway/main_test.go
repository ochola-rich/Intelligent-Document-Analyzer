package main

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type readSeekCloser struct {
	*bytes.Reader
}

func (r readSeekCloser) Close() error { return nil }

func newMultipartRequest(t *testing.T, method, path, fieldName, filename string, content []byte) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func TestHandleHealthOK(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	HandleHealth(rec, req)

	res := rec.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusOK)
	}
	if ct := res.Header.Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type = %q, want %q", ct, "application/json")
	}
	body, _ := io.ReadAll(res.Body)
	if strings.TrimSpace(string(body)) != `{"status":"ok"}` {
		t.Fatalf("body = %q, want %q", strings.TrimSpace(string(body)), `{"status":"ok"}`)
	}
}

func TestHandleHealthMethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/healthz", nil)
	rec := httptest.NewRecorder()

	HandleHealth(rec, req)

	res := rec.Result()
	if res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusMethodNotAllowed)
	}
	if allow := res.Header.Get("Allow"); allow != http.MethodGet {
		t.Fatalf("allow = %q, want %q", allow, http.MethodGet)
	}
}

func TestHandleUploadMethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/upload", nil)
	rec := httptest.NewRecorder()

	HandleUpload(rec, req)

	res := rec.Result()
	if res.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusMethodNotAllowed)
	}
	if allow := res.Header.Get("Allow"); allow != http.MethodPost {
		t.Fatalf("allow = %q, want %q", allow, http.MethodPost)
	}
}

func TestHandleUploadBadRequest(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/upload", bytes.NewBufferString("not multipart"))
	rec := httptest.NewRecorder()

	HandleUpload(rec, req)

	res := rec.Result()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusBadRequest)
	}
}

func TestHandleUploadForwardsToPDFService(t *testing.T) {
	req := newMultipartRequest(t, http.MethodPost, "/upload", "file", "doc.pdf", []byte("%PDF-1.7\n"))
	rec := httptest.NewRecorder()

	var gotHost string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHost = r.Host
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"job-1","status":"queued"}`))
	}))
	t.Cleanup(upstream.Close)

	oldTransport := http.DefaultTransport
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return net.Dial(network, upstream.Listener.Addr().String())
		},
	}
	http.DefaultTransport = transport
	t.Cleanup(func() {
		http.DefaultTransport = oldTransport
		transport.CloseIdleConnections()
	})

	HandleUpload(rec, req)

	res := rec.Result()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusCreated)
	}
	body, _ := io.ReadAll(res.Body)
	if strings.TrimSpace(string(body)) != `{"id":"job-1","status":"queued"}` {
		t.Fatalf("body = %q, want %q", strings.TrimSpace(string(body)), `{"id":"job-1","status":"queued"}`)
	}
	if gotHost != "localhost:8081" {
		t.Fatalf("upstream host = %q, want %q", gotHost, "localhost:8081")
	}
}

func TestDetectTargetURLDefaultsToPDFService(t *testing.T) {
	if got := detectTargetURL([]byte("plain text")); got != pdfServiceURL {
		t.Fatalf("detectTargetURL = %q, want %q", got, pdfServiceURL)
	}
}
