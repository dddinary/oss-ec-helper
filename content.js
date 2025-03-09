// 错误码正则表达式
const OSS_ERROR_CODE_REGEX = /\b\d{4}-\d{8}\b/g;

// 缓存对象，用于存储已获取的错误信息
const errorCache = new Map();

// 创建tooltip元素
const tooltip = document.createElement('div');
tooltip.className = 'oss-tooltip';
document.body.appendChild(tooltip);

// 标记是否鼠标在tooltip上
let isMouseOnTooltip = false;

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 获取错误码信息
async function fetchErrorInfo(errorCode) {
  if (errorCache.has(errorCode)) {
    return errorCache.get(errorCode);
  }

  try {
    const url = `https://help.aliyun.com/zh/oss/support/${errorCode}`;
    const response = await fetch(url);
    const text = await response.text();

    // 创建一个临时的DOM元素来解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    // 提取错误描述和原因
    const problemDesc = doc.evaluate(
      "//h2[contains(., '问题描述')]/following-sibling::p[1]",
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue?.textContent || '';

    const problemCause = doc.evaluate(
      "//h2[contains(., '问题原因')]/following-sibling::p[1]",
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue?.textContent || '';

    const solution = doc.evaluate(
      "//h2[contains(., '解决方案')]/following-sibling::p[1]",
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue?.textContent || '';

    const description = problemDesc;
    const reason = `原因：${problemCause}\n解决方案：${solution}`;

    const info = { description, reason, url };
    errorCache.set(errorCode, info);
    return info;
  } catch (error) {
    console.error('获取错误信息失败:', error);
    return null;
  }
}

// 显示tooltip
function showTooltip(event, info, errorCode) {
  const { clientX, clientY } = event;
  tooltip.innerHTML = `
    <div class="oss-tooltip-title">错误码说明</div>
    <div class="oss-tooltip-content">${info.description}</div>
    <div class="oss-tooltip-reason">${info.reason}</div>
    <div class="oss-tooltip-link">点击查看详情</div>
  `;

  // 为新创建的链接添加事件监听器
  const link = tooltip.querySelector('.oss-tooltip-link');
  if (link) {
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`https://help.aliyun.com/zh/oss/support/${errorCode}`, '_blank');
    });
  }

  tooltip.classList.add('show');

  // 计算位置，避免tooltip超出视窗
  const rect = tooltip.getBoundingClientRect();
  const spaceBelow = window.innerHeight - clientY;
  const spaceRight = window.innerWidth - clientX;

  let top = clientY + 10;
  let left = clientX + 10;

  if (spaceBelow < rect.height) {
    top = clientY - rect.height - 10;
  }

  if (spaceRight < rect.width) {
    left = clientX - rect.width - 10;
  }

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

// 隐藏tooltip
const hideTooltip = debounce(() => {
  if (!isMouseOnTooltip) {
    tooltip.classList.remove('show');
  }
}, 200);

// 为tooltip添加鼠标事件监听
tooltip.addEventListener('mouseenter', () => {
  isMouseOnTooltip = true;
});

tooltip.addEventListener('mouseleave', () => {
  isMouseOnTooltip = false;
  hideTooltip();
});

// 处理页面中的错误码
function processErrorCodes() {
  // 获取所有文本节点
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        const parent = node.parentNode;
        
        // 检查是否在特定的XML标签中
        if (parent.tagName === 'EC' || 
            parent.tagName === 'RECOMMENDDOC' ||
            parent.tagName === 'A' ||
            parent.closest('EC') ||
            parent.closest('RecommendDoc')) {
          return NodeFilter.FILTER_REJECT;
        }

        // 检查是否已经被处理过
        if (parent.classList?.contains('oss-error-code')) {
          return NodeFilter.FILTER_REJECT;
        }

        // 检查文本是否包含错误码
        if (OSS_ERROR_CODE_REGEX.test(node.textContent)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    },
    false
  );

  const nodesToProcess = [];
  while (walker.nextNode()) {
    nodesToProcess.push(walker.currentNode);
  }

  // 处理找到的节点
  nodesToProcess.forEach(node => {
    const text = node.textContent;
    const parts = text.split(OSS_ERROR_CODE_REGEX);
    const matches = text.match(OSS_ERROR_CODE_REGEX);

    if (!matches) return;

    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      fragment.appendChild(document.createTextNode(part));
      if (matches[index]) {
        const span = document.createElement('span');
        span.className = 'oss-error-code';
        span.textContent = matches[index];
        
        // 添加事件监听器
        span.addEventListener('mouseover', async (e) => {
          const info = await fetchErrorInfo(matches[index]);
          if (info) {
            showTooltip(e, info, matches[index]);
          }
        });

        span.addEventListener('mouseout', hideTooltip);

        fragment.appendChild(span);
      }
    });

    node.parentNode.replaceChild(fragment, node);
  });
}

// 初始化
processErrorCodes();

// 监听DOM变化
const observer = new MutationObserver((mutations) => {
  let shouldProcess = false;
  for (const mutation of mutations) {
    if (mutation.type === 'childList' && 
        !mutation.target.classList.contains('oss-tooltip')) {
      shouldProcess = true;
      break;
    }
  }
  if (shouldProcess) {
    processErrorCodes();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
}); 