# 쇼츠 음성 받아쓰기 — python transcribe.py <소리.wav> <결과.json>  (faster-whisper 필요, 처음 한 번 small 모델을 받는다)
# 품질 검사(shorts-qa.mjs)가 대본과 비교해 흐리게 읽힌 곳을 찾는다
import json
import sys

from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, _ = model.transcribe(sys.argv[1], language="ko", word_timestamps=False, vad_filter=False)
out = [{"s": round(s.start, 2), "e": round(s.end, 2), "t": s.text.strip()} for s in segments]
json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
