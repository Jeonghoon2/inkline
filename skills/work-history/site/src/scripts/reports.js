// 주간 보고 탭
document.getElementById('reports').innerHTML = (DATA?.reports ?? []).map(r => `<div class="report">${md(r.text)}</div>`).join('') || '<div class="empty">주간 보고가 없습니다</div>'
