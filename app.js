// 콘티마법사 클라이언트 스크립트
// - API 키 저장/로드 (localStorage)
// - Gemini 호출로 스토리보드 생성
// - 결과 페이지로 이동

const dom = {
  apiKey: document.getElementById('apiKey'),
  saveKeyBtn: document.getElementById('saveKeyBtn'),
  synopsis: document.getElementById('synopsis'),
  cutCount: document.getElementById('cutCount'),
  wantImages: document.getElementById('wantImages'),
  generateBtn: document.getElementById('generateBtn'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  resultsSection: document.getElementById('resultsSection'),
  copyAllBtn: document.getElementById('copyAllBtn'),
  newStoryBtn: document.getElementById('newStoryBtn'),
};

const STORAGE_KEY = 'contiWizard_gemini_key';

function loadApiKeyFromStorage(){
  try{
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved){
      dom.apiKey.value = saved;
      setStatus('저장된 API 키를 불러왔어요.');
    }
  }catch(err){
    console.warn('Failed to load key', err);
  }
}

function saveApiKeyToStorage(){
  try{
    const key = dom.apiKey.value.trim();
    if(!key){
      setStatus('API 키를 입력해주세요.');
      return;
    }
    localStorage.setItem(STORAGE_KEY, key);
    setStatus('API 키가 저장되었어요.');
  }catch(err){
    setStatus('API 키 저장 중 오류가 발생했어요.');
  }
}

function setStatus(message){
  dom.status.textContent = message || '';
}

function setLoading(isLoading){
  dom.generateBtn.disabled = isLoading;
  dom.generateBtn.textContent = isLoading ? '생성 중... ✨' : '스토리보드 생성하기 🎬';
}

function buildPrompt({ synopsis, cutCount, wantImages }){
  const imagePart = wantImages ? `각 컷마다 imagePrompt 필드에 간단한 이미지 프롬프트를 포함하세요.` : 'imagePrompt 필드는 null로 설정하세요.';
  
  return `웹툰 스토리보드 생성 요청입니다.

줄거리: ${synopsis}
컷 수: ${cutCount}개

위 줄거리를 초등학교 5-6학년이 이해하기 쉬운 **간단하고 재미있는** 웹툰 스토리보드로 만들어주세요.

**작성 가이드라인:**
- **매우 간단하고 짧은 문장**으로 작성
- 초등학생이 쉽게 이해할 수 있는 쉬운 단어만 사용
- 각 컷의 설명은 **1-2문장**으로 간결하게
- 대사는 **한 줄**로 간단하게
- 재미있고 웃긴 요소 포함

반드시 아래 JSON 형식을 정확히 따라주세요:

{
  "title": "간단한 제목",
  "summary": "한 줄 요약",
  "cutCount": ${cutCount},
  "scenes": [
    {
      "cut": 1,
      "sceneTitle": "간단한 장면 제목",
      "description": "1-2문장으로 간단한 장면 설명",
      "dialogue": "한 줄 대사",
      "imagePrompt": ${wantImages ? '"간단한 이미지 설명"' : 'null'}
    }
  ]
}

${imagePart}

JSON만 반환하고 다른 텍스트는 포함하지 마세요.`;
}

async function callGemini({ apiKey, prompt }){
  // Google Generative Language API - Text endpoint (models:gemini-2.5-flash-preview-05-20)
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=' + encodeURIComponent(apiKey);
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { 
      temperature: 0.7, 
      maxOutputTokens: 4096, // 토큰 수 증가
      topP: 0.8,
      topK: 40
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if(!res.ok){
    const text = await res.text();
    const err = new Error('Gemini 오류: ' + res.status + ' ' + text);
    err.status = res.status;
    try{ err.data = JSON.parse(text); }catch(_){ err.data = text; }
    throw err;
  }
  const data = await res.json();
  console.log('Gemini 응답 데이터:', data); // 디버깅용
  
  const candidates = data.candidates || [];
  if(candidates.length === 0){
    throw new Error('모델이 응답을 생성하지 않았어요. 프롬프트를 다시 확인해주세요.');
  }
  
  const candidate = candidates[0];
  if(candidate.finishReason === 'SAFETY'){
    throw new Error('안전 필터에 의해 차단되었어요. 다른 줄거리로 시도해주세요.');
  }
  if(candidate.finishReason === 'MAX_TOKENS'){
    throw new Error('응답이 너무 길어서 잘렸어요. 컷 수를 줄여보세요.');
  }
  
  const text = candidate?.content?.parts?.[0]?.text || '';
  if(!text.trim()){
    throw new Error('모델이 빈 응답을 반환했어요. 다시 시도해주세요.');
  }
  
  return text.trim();
}

async function callGeminiWithRetry(params){
  const maxAttempts = 3;
  for(let attempt=1; attempt<=maxAttempts; attempt++){
    try{
      if(attempt>1){
        setStatus(`일시적인 오류로 재시도 중 (${attempt}/${maxAttempts})...`);
      }
      return await callGemini(params);
    }catch(err){
      const status = err.status;
      const retriable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if(!retriable || attempt===maxAttempts){
        throw err;
      }
      // 지수 백오프 + 지터
      const base = 600; // ms
      const delay = Math.min(4000, base * Math.pow(2, attempt-1)) + Math.random()*250;
      await new Promise(r=>setTimeout(r, delay));
    }
  }
}

function tryParseJsonFromModel(text){
  // 모델이 코드블록으로 감싸는 경우 제거
  let cleaned = text.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
  
  // 여러 시도로 JSON 추출
  const attempts = [
    // 1. 전체 텍스트 파싱 시도
    () => JSON.parse(cleaned),
    
    // 2. 첫 번째 JSON 객체 찾기
    () => {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if(match) return JSON.parse(match[0]);
      throw new Error('JSON 객체를 찾을 수 없음');
    },
    
    // 3. 마크다운 제거 후 재시도
    () => {
      cleaned = cleaned.replace(/^#+\s*.*$/gm, '').replace(/^\*\s*/gm, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if(match) return JSON.parse(match[0]);
      throw new Error('마크다운 제거 후에도 JSON을 찾을 수 없음');
    },
    
    // 4. 라인별로 JSON 시작점 찾기
    () => {
      const lines = cleaned.split('\n');
      let jsonStart = -1;
      for(let i = 0; i < lines.length; i++){
        if(lines[i].trim().startsWith('{')) {
          jsonStart = i;
          break;
        }
      }
      if(jsonStart >= 0) {
        const jsonLines = lines.slice(jsonStart);
        const jsonText = jsonLines.join('\n');
        return JSON.parse(jsonText);
      }
      throw new Error('JSON 시작점을 찾을 수 없음');
    }
  ];
  
  for(let i = 0; i < attempts.length; i++){
    try{
      return attempts[i]();
    }catch(err){
      console.warn(`JSON 파싱 시도 ${i+1} 실패:`, err.message);
      if(i === attempts.length - 1) {
        // 마지막 시도에서도 실패하면 원본 텍스트와 함께 오류 메시지
        console.error('원본 응답:', text);
        throw new Error(`모델 응답을 JSON으로 해석하지 못했어요. 원본: ${text.substring(0, 200)}...`);
      }
    }
  }
}

function renderResults(doc){
  dom.results.innerHTML = '';
  
  // 제목과 요약 섹션
  const headerDiv = document.createElement('div');
  headerDiv.className = 'story-header';
  headerDiv.innerHTML = `
    <h3>${escapeHtml(doc.title || '제목 없음')}</h3>
    <p class="summary">${escapeHtml(doc.summary || '')}</p>
  `;
  dom.results.appendChild(headerDiv);

  // 컷별 구역 생성
  (doc.scenes || []).forEach((s, index)=>{
    const cutDiv = document.createElement('div');
    cutDiv.className = 'cut-section';
    cutDiv.innerHTML = `
      <div class="cut-header">
        <span class="cut-number">🟦 ${s.cut}컷</span>
        <span class="cut-title">${escapeHtml(s.sceneTitle || '')}</span>
      </div>
      <div class="cut-content">
        <div class="content-item">
          <span class="content-label">📝 설명글</span>
          <p class="content-text">${escapeHtml(s.description || '')}</p>
        </div>
        <div class="content-item">
          <span class="content-label">💬 대사</span>
          <p class="content-text">${escapeHtml(s.dialogue || '')}</p>
        </div>
        ${s.imagePrompt ? `
        <div class="content-item">
          <span class="content-label">🎨 이미지프롬프트</span>
          <p class="content-text">${escapeHtml(s.imagePrompt)}</p>
        </div>
        ` : ''}
      </div>
    `;
    dom.results.appendChild(cutDiv);
  });

  // 복사용 텍스트 생성
  let resultText = `### ${escapeHtml(doc.title || '제목 없음')}\n`;
  resultText += `${escapeHtml(doc.summary || '')}\n\n`;
  resultText += `---\n\n`;
  resultText += `설명글 [📝], 대사 [💬], 이미지프롬프트 [🎨]\n\n`;
  resultText += `---\n\n`;

  (doc.scenes || []).forEach((s)=>{
    resultText += `🟦 ${s.cut}컷: ${escapeHtml(s.sceneTitle || '')}\n`;
    resultText += `[📝] ${escapeHtml(s.description || '')}\n`;
    resultText += `[💬] ${escapeHtml(s.dialogue || '')}\n`;
    if(s.imagePrompt){
      resultText += `[🎨] ${escapeHtml(s.imagePrompt)}\n`;
    }
    resultText += `\n---\n\n`;
  });
  
  // 복사용 텍스트 저장
  window.__lastResultText = resultText;
  
  // 결과 섹션 표시
  dom.resultsSection.style.display = 'block';
  
  // 결과 섹션으로 스크롤
  dom.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function copyAllResults(){
  const text = window.__lastResultText || dom.results.innerText;
  navigator.clipboard.writeText(text).then(()=>{
    // 복사 성공 알림
    const btn = dom.copyAllBtn;
    const originalText = btn.textContent;
    btn.textContent = '복사 완료! ✅';
    btn.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  }).catch(()=>{
    alert('복사 권한을 허용해주세요.');
  });
}

function newStory(){
  // 입력 폼 초기화
  dom.synopsis.value = '';
  dom.cutCount.value = '6';
  dom.wantImages.checked = false;
  
  // 결과 섹션 숨기기
  dom.resultsSection.style.display = 'none';
  
  // 상태 메시지 초기화
  setStatus('');
  
  // 입력 폼으로 스크롤
  dom.synopsis.scrollIntoView({ behavior: 'smooth' });
  dom.synopsis.focus();
}

function escapeHtml(str){
  return String(str).replace(/[&<>"]/g, (c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  })[c]);
}

async function onGenerate(){
  const apiKey = dom.apiKey.value.trim();
  if(!apiKey){ setStatus('API 키가 필요해요.'); return; }
  const synopsis = dom.synopsis.value.trim();
  if(!synopsis){ setStatus('줄거리를 입력해주세요.'); return; }
  const cutCount = Math.max(1, Math.min(30, Number(dom.cutCount.value) || 1));
  const wantImages = dom.wantImages.checked;

  setLoading(true);
  setStatus('모델에게 요청 중...');

  try{
    const prompt = buildPrompt({ synopsis, cutCount, wantImages });
    const raw = await callGeminiWithRetry({ apiKey, prompt });
    const json = tryParseJsonFromModel(raw);
    // 안전장치: cut 번호 보정
    if(Array.isArray(json.scenes)){
      json.scenes = json.scenes.map((s, i)=>({
        cut: s.cut ?? i+1,
        sceneTitle: s.sceneTitle ?? `장면 ${i+1}`,
        description: s.description ?? '',
        dialogue: s.dialogue ?? '',
        imagePrompt: s.imagePrompt ?? null,
        imageUrl: s.imageUrl ?? null,
      }));
      json.cutCount = json.cutCount ?? json.scenes.length;
    }
    renderResults(json);
    setStatus('완료! 결과를 확인하세요.');
  }catch(err){
    console.error(err);
    // 사용자 친화적 메시지
    if(err.status === 401){
      setStatus('인증 실패: API 키가 올바른지 확인해주세요.');
    }else if(err.status === 429){
      setStatus('요청이 너무 많아요(429). 잠시 후 다시 시도해주세요.');
    }else if(err.status === 503){
      setStatus('서비스가 일시적으로 불안정해요(503). 잠시 후 다시 시도해주세요.');
    }else{
      setStatus(err.message || '오류가 발생했어요.');
    }
  }finally{
    setLoading(false);
  }
}

// 이벤트 바인딩
dom.saveKeyBtn.addEventListener('click', saveApiKeyToStorage);
dom.generateBtn.addEventListener('click', onGenerate);
dom.copyAllBtn.addEventListener('click', copyAllResults);
dom.newStoryBtn.addEventListener('click', newStory);

loadApiKeyFromStorage();