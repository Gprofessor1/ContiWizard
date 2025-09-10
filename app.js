// 콘티마법사 클라이언트 스크립트
// - API 키 저장/로드 (localStorage)
// - Gemini 호출로 스토리보드 생성
// - 결과 렌더링/복사/다운로드

const dom = {
  apiKey: document.getElementById('apiKey'),
  saveKeyBtn: document.getElementById('saveKeyBtn'),
  synopsis: document.getElementById('synopsis'),
  cutCount: document.getElementById('cutCount'),
  tone: document.getElementById('tone'),
  wantImages: document.getElementById('wantImages'),
  generateBtn: document.getElementById('generateBtn'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  copyAllBtn: document.getElementById('copyAllBtn'),
  downloadJsonBtn: document.getElementById('downloadJsonBtn'),
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

function buildPrompt({ synopsis, cutCount, tone, wantImages }){
  const imagePart = wantImages ? `각 컷마다 이미지 프롬프트도 생성하세요. 이미지 프롬프트는 장면을 잘 설명하는 1-2문장, 스타일은 파스텔톤, 현대적 일러스트, 부드러운 조명으로.
` : '';
  return `너는 스토리보드 아티스트이자 시나리오 작가야.
입력된 줄거리를 ${cutCount}개의 장면(컷)으로 나눠 아래 JSON 스키마에 맞춰 출력해.
각 장면은 간결하고 시각적으로 명확해야 해. 톤/분위기: ${tone || '사용자 지정 없음'}.
${imagePart}
JSON만 반환해. 마크다운 금지.

스키마:
{
  "title": string, // 전체 제목
  "summary": string, // 한 줄 요약
  "cutCount": number,
  "scenes": [
    {
      "cut": number, // 1부터 시작
      "sceneTitle": string,
      "description": string, // 장면 설명
      "dialogue": string, // 대사 또는 내레이션
      "imagePrompt": string | null // 이미지 프롬프트 (선택)
    }
  ]
}

줄거리:
${synopsis}`;
}

async function callGemini({ apiKey, prompt }){
  // Google Generative Language API - Text endpoint (models:gemini-2.5-flash-preview-05-20)
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=' + encodeURIComponent(apiKey);
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if(!res.ok){
    const text = await res.text();
    throw new Error('Gemini 오류: ' + res.status + ' ' + text);
  }
  const data = await res.json();
  const candidates = data.candidates || [];
  const text = candidates[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

function tryParseJsonFromModel(text){
  // 모델이 코드블록으로 감싸는 경우 제거
  const cleaned = text.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
  try{
    return JSON.parse(cleaned);
  }catch(err){
    // JSON만 반환하도록 요청했지만 실패할 수 있으므로, 중괄호 블록 추출 재시도
    const match = cleaned.match(/\{[\s\S]*\}$/);
    if(match){
      try{ return JSON.parse(match[0]); }catch(e){}
    }
    throw new Error('모델 응답을 JSON으로 해석하지 못했어요.');
  }
}

function renderResults(doc){
  dom.results.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'scene';
  header.innerHTML = `
    <div class="scene-header">
      <div class="scene-title">${escapeHtml(doc.title || '제목 없음')}</div>
      <span>${doc.cutCount || (doc.scenes?.length ?? 0)}컷</span>
    </div>
    <p>${escapeHtml(doc.summary || '')}</p>
  `;
  dom.results.appendChild(header);

  (doc.scenes || []).forEach((s)=>{
    const el = document.createElement('div');
    el.className = 'scene';
    const imgPart = s.imageUrl ? `<img src="${encodeURI(s.imageUrl)}" alt="scene ${s.cut}">` : '';
    el.innerHTML = `
      <div class="scene-header">
        <div class="scene-title">컷 ${s.cut}. ${escapeHtml(s.sceneTitle || '')}</div>
      </div>
      ${imgPart}
      <p>${escapeHtml(s.description || '')}</p>
      <pre>${escapeHtml(s.dialogue || '')}</pre>
      ${s.imagePrompt ? `<pre>${escapeHtml(s.imagePrompt)}</pre>` : ''}
    `;
    dom.results.appendChild(el);
  });
}

function escapeHtml(str){
  return String(str).replace(/[&<>"]/g, (c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  })[c]);
}

function copyAllResults(){
  const text = dom.results.innerText;
  navigator.clipboard.writeText(text).then(()=>{
    setStatus('전체 결과를 복사했어요.');
  }).catch(()=>{
    setStatus('복사 권한을 허용해주세요.');
  });
}

function downloadJson(doc){
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'conti_wizard_storyboard.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function onGenerate(){
  const apiKey = dom.apiKey.value.trim();
  if(!apiKey){ setStatus('API 키가 필요해요.'); return; }
  const synopsis = dom.synopsis.value.trim();
  if(!synopsis){ setStatus('줄거리를 입력해주세요.'); return; }
  const cutCount = Math.max(1, Math.min(30, Number(dom.cutCount.value) || 1));
  const tone = dom.tone.value.trim();
  const wantImages = dom.wantImages.checked;

  setLoading(true);
  setStatus('모델에게 요청 중...');
  dom.results.innerHTML = '';

  try{
    const prompt = buildPrompt({ synopsis, cutCount, tone, wantImages });
    const raw = await callGemini({ apiKey, prompt });
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

    // 저장해두면 재사용 편의
    window.__lastStoryboard = json;
    setStatus('완료! 결과를 확인하세요.');
  }catch(err){
    console.error(err);
    setStatus(err.message || '오류가 발생했어요.');
  }finally{
    setLoading(false);
  }
}

// 이벤트 바인딩
dom.saveKeyBtn.addEventListener('click', saveApiKeyToStorage);
dom.copyAllBtn.addEventListener('click', copyAllResults);
dom.downloadJsonBtn.addEventListener('click', ()=>{
  if(window.__lastStoryboard){
    downloadJson(window.__lastStoryboard);
  }else{
    setStatus('먼저 생성을 실행해 주세요.');
  }
});
dom.generateBtn.addEventListener('click', onGenerate);

loadApiKeyFromStorage();


