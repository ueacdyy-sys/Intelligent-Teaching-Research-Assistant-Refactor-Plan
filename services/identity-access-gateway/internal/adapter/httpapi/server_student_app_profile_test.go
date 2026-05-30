package httpapi_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStudentAppProfileReturnsMobileReadModel(t *testing.T) {
	handler := newTestHandler()
	login := httptest.NewRequest(
		http.MethodPost,
		"/v1/identity/sessions/password",
		bytes.NewBufferString(`{"identifier":"student001","password":"ueacd","entryPoint":"STUDENT_APP","requestedRole":"STUDENT"}`),
	)
	loginResponse := httptest.NewRecorder()
	handler.ServeHTTP(loginResponse, login)
	if loginResponse.Code != http.StatusCreated {
		t.Fatalf("login status = %d, body = %s", loginResponse.Code, loginResponse.Body.String())
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/profile", nil)
	request.Header.Set("Authorization", "Bearer access_http_1")

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	for _, fragment := range [][]byte{
		[]byte(`"studentId":"user_student"`),
		[]byte(`"principalId":"user_student"`),
		[]byte(`"displayName":"Student"`),
		[]byte(`"entryPoint":"STUDENT_APP"`),
	} {
		if !bytes.Contains(response.Body.Bytes(), fragment) {
			t.Fatalf("body missing %s in %s", fragment, response.Body.String())
		}
	}
	for _, leaked := range [][]byte{
		[]byte(`"scopes"`),
		[]byte(`"knowledgeAccess"`),
	} {
		if bytes.Contains(response.Body.Bytes(), leaked) {
			t.Fatalf("profile leaked internal field %s in %s", leaked, response.Body.String())
		}
	}
}

func TestStudentAppProfileRequiresBearerToken(t *testing.T) {
	handler := newTestHandler()
	request := httptest.NewRequest(http.MethodGet, "/v1/student-app/profile", nil)

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}
