$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'), 4173)
$listener.Start()
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
while ($listener.IsListening) {
  $client = $listener.AcceptTcpClient()
  $stream = $client.GetStream()
  $buffer = New-Object byte[] 4096
  $read = $stream.Read($buffer, 0, $buffer.Length)
  $request = [Text.Encoding]::ASCII.GetString($buffer, 0, $read)
  $relative = (($request -split "`r?`n")[0] -split ' ')[1].TrimStart('/') -replace '/', '\\'
  $path = Join-Path $base $relative
  $status = '200 OK'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    $path = Join-Path $base 'index.html'
    $status = '404 Not Found'
  }
  $bytes = [IO.File]::ReadAllBytes($path)
  $header = "HTTP/1.1 $status`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
  $headBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headBytes, 0, $headBytes.Length)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close(); $client.Close()
}
