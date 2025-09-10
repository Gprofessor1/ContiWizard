// 결과 페이지 스크립트
// - URL 파라미터에서 스토리보드 데이터 받기
// - 결과 렌더링 및 복사 기능
// - 메인 페이지로 돌아가기

function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

function renderResults(doc) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '';
  
  // 제목과 요약 섹션
  const headerDiv = document.createElement('div');
  headerDiv.className = 'story-header';
  headerDiv.innerHTML = `
    <h3>${escapeHtml(doc.title || '제목 없음')}</h3>
    <p class="summary">${escapeHtml(doc.summary || '')}</p>
  `;
  resultsDiv.appendChild(headerDiv);

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
    resultsDiv.appendChild(cutDiv);
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
}

function escapeHtml(str){
  return String(str).replace(/[&<>"]/g, (c)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  })[c]);
}

function copyAllResults(){
  const text = window.__lastResultText || document.getElementById('results').innerText;
  navigator.clipboard.writeText(text).then(()=>{
    // 복사 성공 알림
    const btn = document.getElementById('copyAllBtn');
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

function goBack(){
  window.location.href = 'index.html';
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', function() {
  // URL에서 스토리보드 데이터 가져오기
  const storyboardData = getUrlParameter('data');
  
  if(storyboardData) {
    try {
      const decodedData = decodeURIComponent(storyboardData);
      const storyboard = JSON.parse(decodedData);
      renderResults(storyboard);
    } catch(err) {
      console.error('스토리보드 데이터 파싱 오류:', err);
      document.getElementById('results').innerHTML = '<p style="text-align: center; color: #666;">결과를 불러올 수 없습니다.</p>';
    }
  } else {
    document.getElementById('results').innerHTML = '<p style="text-align: center; color: #666;">표시할 결과가 없습니다.</p>';
  }
  
  // 이벤트 바인딩
  document.getElementById('copyAllBtn').addEventListener('click', copyAllResults);
  document.getElementById('backBtn').addEventListener('click', goBack);
});
