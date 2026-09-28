Add-Type -AssemblyName System.Speech
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$lines = @{
  "pos_hello" = "Hello, Barnaby."; "pos_hey" = "Hey Barnaby"; "pos_slow" = "Hello... Barnaby";
  "neg_everybody" = "Hello everybody, how are you?"; "neg_photos" = "I want to send my photos to Anne Marie.";
  "neg_barney" = "Hello Barney"; "neg_library" = "I went to the library on Tuesday."; "neg_barbara" = "Hello Barbara, nice to see you."
}
foreach ($k in $lines.Keys) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SetOutputToWaveFile("G:\seniorhelper\app\test\fixtures\wake\$k.wav", $fmt)
  $s.Speak($lines[$k]); $s.Dispose()
}
