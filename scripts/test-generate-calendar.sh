#!/bin/bash

# Test script for /api/organic/generate-calendar endpoint
# Usage: ./scripts/test-generate-calendar.sh [basic|with-options|invalid-payload|no-auth|backend-error|stream-debug|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_URL="${SERVER_URL:-http://localhost:4000}"
API_ENDPOINT="/api/organic/generate-calendar"
FULL_URL="${SERVER_URL}${API_ENDPOINT}"

# Check if jq is available
HAS_JQ=false
if command -v jq &> /dev/null; then
    HAS_JQ=true
fi

# Helper function to print section headers
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Helper function to print curl command
print_curl_cmd() {
    echo -e "${YELLOW}curl command:${NC}"
    echo "$1"
    echo ""
}

# Pattern 1: Basic valid request
run_basic() {
    print_header "PATTERN 1: Basic Generation Request"
    
    local payload='{
        "brandProfileId": "test-brand-123",
        "weekStart": "2026-02-01",
        "timezone": "America/New_York",
        "placements": [
            {
                "placementId": "seed-001",
                "trendId": "trend-001",
                "dayId": "2026-02-02",
                "scheduledAt": "2026-02-02T14:00:00.000Z",
                "timeLabel": "2:00 PM",
                "platform": "instagram",
                "accountId": "ig-test-account",
                "seedSource": "trend",
                "desiredFormat": "Reel"
            }
        ],
        "platformAccountIds": {
            "instagram": "ig-test-account"
        }
    }'
    
    echo -e "${GREEN}Request payload:${NC}"
    if [ "$HAS_JQ" = true ]; then
        echo "$payload" | jq .
    else
        echo "$payload"
    fi
    echo ""
    
    local curl_cmd="curl -X POST \"${FULL_URL}\" \
        -H \"Content-Type: application/json\" \
        -H \"Accept: application/x-ndjson\" \
        -d '$payload' \
        -s -w \"\\nHTTP Status: %{http_code}\\n\""
    
    print_curl_cmd "$curl_cmd"
    
    echo -e "${GREEN}Response:${NC}"
    eval "$curl_cmd" | head -20
    echo "... (stream continues)"
}

# Pattern 2: Request with all options
run_with_options() {
    print_header "PATTERN 2: Request with All Options"
    
    local payload='{
        "brandProfileId": "test-brand-456",
        "weekStart": "2026-02-08",
        "timezone": "America/Los_Angeles",
        "placements": [
            {
                "placementId": "seed-002",
                "trendId": "trend-002",
                "dayId": "2026-02-09",
                "scheduledAt": "2026-02-09T09:00:00.000Z",
                "timeLabel": "9:00 AM",
                "platform": "instagram",
                "accountId": "ig-test-account",
                "seedSource": "trend",
                "desiredFormat": "Carousel",
                "metadata": {
                    "theme": "valentine",
                    "tone": "playful"
                }
            },
            {
                "placementId": "seed-003",
                "trendId": "trend-003",
                "dayId": "2026-02-10",
                "scheduledAt": "2026-02-10T13:00:00.000Z",
                "timeLabel": "1:00 PM",
                "platform": "linkedin",
                "accountId": "li-test-account",
                "seedSource": "question",
                "desiredFormat": "Post"
            }
        ],
        "platformAccountIds": {
            "instagram": "ig-test-account",
            "linkedin": "li-test-account"
        },
        "options": {
            "schedulePreset": "beta-launch",
            "includeNewsletter": true,
            "newsletterDayId": "2026-02-08",
            "guidancePrompt": "Create engaging, authentic content that resonates with our audience",
            "language": "en",
            "preferredPlatforms": ["instagram", "linkedin"]
        }
    }'
    
    echo -e "${GREEN}Request payload:${NC}"
    if [ "$HAS_JQ" = true ]; then
        echo "$payload" | jq .
    else
        echo "$payload"
    fi
    echo ""
    
    local curl_cmd="curl -X POST \"${FULL_URL}\" \
        -H \"Content-Type: application/json\" \
        -H \"Accept: application/x-ndjson\" \
        -d '$payload' \
        -s -w \"\\nHTTP Status: %{http_code}\\n\""
    
    print_curl_cmd "$curl_cmd"
    
    echo -e "${GREEN}Response:${NC}"
    eval "$curl_cmd" | head -30
    echo "... (stream continues)"
}

# Pattern 3: Invalid payload (should return 400)
run_invalid_payload() {
    print_header "PATTERN 3: Invalid Payload (Expect 400)"
    
    local payload='{
        "brandProfileId": "",
        "weekStart": "invalid-date",
        "timezone": "UTC"
    }'
    
    echo -e "${GREEN}Request payload (invalid):${NC}"
    echo "$payload"
    echo ""
    
    local curl_cmd="curl -X POST \"${FULL_URL}\" \
        -H \"Content-Type: application/json\" \
        -H \"Accept: application/x-ndjson\" \
        -d '$payload' \
        -s -w \"\\nHTTP Status: %{http_code}\\n\""
    
    print_curl_cmd "$curl_cmd"
    
    echo -e "${GREEN}Response:${NC}"
    eval "$curl_cmd"
}

# Pattern 4: No authentication (should return 401)
run_no_auth() {
    print_header "PATTERN 4: No Authentication (Expect 401)"
    
    local payload='{
        "brandProfileId": "test-brand-789",
        "weekStart": "2026-02-15",
        "timezone": "UTC",
        "placements": []
    }'
    
    echo -e "${GREEN}Request payload:${NC}"
    echo "$payload"
    echo ""
    
    # Clear any cookies to simulate unauthenticated request
    local curl_cmd="curl -X POST \"${FULL_URL}\" \
        -H \"Content-Type: application/json\" \
        -H \"Accept: application/x-ndjson\" \
        -d '$payload' \
        -s -w \"\\nHTTP Status: %{http_code}\\n\" \
        -c /dev/null -b /dev/null"
    
    print_curl_cmd "$curl_cmd"
    
    echo -e "${GREEN}Response (should be 401 Unauthorized):${NC}"
    eval "$curl_cmd"
}

# Pattern 5: Simulate backend error
run_backend_error() {
    print_header "PATTERN 5: Backend Error Simulation"
    echo -e "${YELLOW}Note: This tests error handling when the backend returns an error${NC}"
    
    # This pattern uses an invalid brand profile ID to trigger a backend error
    local payload='{
        "brandProfileId": "non-existent-brand-id",
        "weekStart": "2026-02-15",
        "timezone": "UTC",
        "placements": [
            {
                "placementId": "seed-999",
                "trendId": "trend-999",
                "dayId": "2026-02-15",
                "scheduledAt": "2026-02-15T09:00:00.000Z",
                "timeLabel": "9:00 AM",
                "platform": "instagram",
                "accountId": "ig-invalid",
                "seedSource": "trend",
                "desiredFormat": "Post"
            }
        ],
        "platformAccountIds": {
            "instagram": "ig-invalid"
        }
    }'
    
    echo -e "${GREEN}Request payload (invalid brand):${NC}"
    echo "$payload"
    echo ""
    
    local curl_cmd="curl -X POST \"${FULL_URL}\" \
        -H \"Content-Type: application/json\" \
        -H \"Accept: application/x-ndjson\" \
        -d '$payload' \
        -s -w \"\\nHTTP Status: %{http_code}\\n\""
    
    print_curl_cmd "$curl_cmd"
    
    echo -e "${GREEN}Response (may show error from backend):${NC}"
    eval "$curl_cmd" | head -5
}

# Pattern 6: Stream debug - show raw NDJSON
run_stream_debug() {
    print_header "PATTERN 6: Stream Debug (Raw NDJSON)"
    echo -e "${YELLOW}This pattern shows the raw NDJSON stream for debugging${NC}"
    
    local payload='{
        "brandProfileId": "test-brand-debug",
        "weekStart": "2026-02-22",
        "timezone": "UTC",
        "placements": [
            {
                "placementId": "seed-debug-1",
                "trendId": "trend-debug",
                "dayId": "2026-02-23",
                "scheduledAt": "2026-02-23T10:00:00.000Z",
                "timeLabel": "10:00 AM",
                "platform": "instagram",
                "accountId": "ig-debug",
                "seedSource": "trend",
                "desiredFormat": "Post"
            }
        ],
        "platformAccountIds": {
            "instagram": "ig-debug"
        }
    }'
    
    echo -e "${GREEN}Request payload:${NC}"
    if [ "$HAS_JQ" = true ]; then
        echo "$payload" | jq .
    else
        echo "$payload"
    fi
    echo ""
    
    local curl_cmd="curl -X POST \"${FULL_URL}\" \
        -H \"Content-Type: application/json\" \
        -H \"Accept: application/x-ndjson\" \
        -d '$payload' \
        -s"
    
    print_curl_cmd "$curl_cmd"
    
    echo -e "${GREEN}Raw NDJSON stream (first 10 lines):${NC}"
    eval "$curl_cmd" | head -10
    echo ""
    echo -e "${YELLOW}Each line is a separate JSON event (progress, placement, error, complete)${NC}"
}

# Run all patterns
run_all() {
    run_basic
    run_with_options
    run_invalid_payload
    run_no_auth
    run_backend_error
    run_stream_debug
}

# Main
print_header "Generate Calendar API Test Script"
echo "Server URL: $SERVER_URL"
echo "API Endpoint: $API_ENDPOINT"
echo "Full URL: $FULL_URL"
if [ "$HAS_JQ" = true ]; then
    echo -e "${GREEN}jq detected: JSON will be formatted${NC}"
else
    echo -e "${YELLOW}jq not found: Install jq for formatted JSON output${NC}"
fi
echo ""
echo "Usage: $0 [basic|with-options|invalid-payload|no-auth|backend-error|stream-debug|all]"
echo ""

# Parse argument
PATTERN="${1:-all}"

case "$PATTERN" in
    basic)
        run_basic
        ;;
    with-options)
        run_with_options
        ;;
    invalid-payload)
        run_invalid_payload
        ;;
    no-auth)
        run_no_auth
        ;;
    backend-error)
        run_backend_error
        ;;
    stream-debug)
        run_stream_debug
        ;;
    all)
        run_all
        ;;
    *)
        echo -e "${RED}Unknown pattern: $PATTERN${NC}"
        echo "Valid patterns: basic, with-options, invalid-payload, no-auth, backend-error, stream-debug, all"
        exit 1
        ;;
esac

print_header "Test Complete"
echo -e "${GREEN}All patterns executed successfully!${NC}"
