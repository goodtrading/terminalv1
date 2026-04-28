$headers = @{
    'Content-Type' = 'application/json'
    'X-Terminal-Key' = 'gt_9f2c1d7a4b6e8f1c3a5d9e2b7f4a6c1d'
}

$body = '{"marketState":{"bias":"NEUTRAL","gamma":"LONG","zone":"$69,720","scenario":"TEST_PUSH","setup":"TESTING_PUSH","probability":100,"outlook":"TEST","timeframe":"TEST","gammaLevel":168,"netGamma":"$0.17B"},"alerts":[{"id":"test-001","text":"Manual test push from Windsurf terminal","status":"active","type":"scenario"}],"zones":[{"label":"TEST ZONE","price":"69,720","type":"resistance","distance":"+6.2%"}]}'

Write-Host "Sending test push to Replit..."
Write-Host "Body:" $body

try {
    $response = Invoke-RestMethod -Uri 'https://c813f257-1316-4114-9d3f-82ebf0011163-00-2vbfcbfkjn2ef.kirk.replit.dev/api/terminal/push' -Method POST -Headers $headers -Body $body
    Write-Host "Response: $response"
} catch {
    Write-Host "Error occurred"
}
