import { computeStats, formatStatsText } from '../core/stats';
import { BUILD_ID, testerId, track } from './analytics';
import { ctx } from './context';
import { copyText, isDialogOpen } from './ui/dialog';

const FORMSPREE_URL = 'https://formspree.io/f/xjywkdoq';

function deviceSummary(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? `iOS ${(ua.match(/OS (\d+[_\d]*)/)?.[1] ?? '').replace(/_/g, '.')}`
    : /Android [\d.]+/.exec(ua)?.[0] ?? (/Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '其他');
  const browser = /MicroMessenger/.test(ua)
    ? '微信内置浏览器'
    : /CriOS|Chrome/.test(ua)
      ? 'Chrome'
      : /Safari/.test(ua)
        ? 'Safari'
        : '其他浏览器';
  const standalone =
    window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone
      ? ' · 主屏幕打开'
      : '';
  return `${os} · ${browser}${standalone} · 屏幕 ${screen.width}×${screen.height} · 版本 ${BUILD_ID}`;
}

const CATEGORIES = ['遇到问题', '想要的功能', '内容有错', '其他'] as const;

const STYLES = {
  shade:
    'position:fixed;inset:0;z-index:1000;background:rgba(58,40,24,.5);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;',
  box:
    'background:#fff4dc;border:4px solid #4a3426;border-radius:18px;max-width:540px;width:100%;max-height:94vh;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:16px;box-sizing:border-box;color:#4a3426;',
  label: 'font-size:15px;font-weight:600;',
  input:
    'width:100%;font-size:16px;border:2px solid #c9b99c;border-radius:10px;padding:8px;box-sizing:border-box;background:#fff;color:#4a3426;font-family:inherit;',
  btn: (primary: boolean) =>
    `font-size:17px;padding:10px 18px;border-radius:12px;border:3px solid #4a3426;cursor:pointer;background:${primary ? '#f08a3c' : '#fff'};color:${primary ? '#fff' : '#4a3426'};font-weight:600;`,
};

let feedbackOpen = false;

export function openFeedbackDialog(): void {
  if (feedbackOpen || isDialogOpen()) return;
  feedbackOpen = true;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) => {
    const node = document.createElement(tag);
    node.style.cssText = css;
    if (text) node.textContent = text;
    return node;
  };

  const shade = el('div', STYLES.shade);
  const box = el('div', STYLES.box);
  box.appendChild(el('div', 'font-size:22px;font-weight:700;', '反馈问题或需求'));
  box.appendChild(
    el('div', 'font-size:14px;color:#7a5a40;line-height:1.5;', '谢谢帮忙测试！遇到的问题、想要的功能、发现的错词错图都可以写。'),
  );
  box.appendChild(el('div', STYLES.label, '是哪一类？'));

  const catRow = el('div', 'display:flex;flex-wrap:wrap;gap:8px;');
  let selected: string = CATEGORIES[0];
  const catBtns: HTMLButtonElement[] = [];
  const refreshCats = () =>
    catBtns.forEach((b) => {
      b.style.cssText = STYLES.btn(b.textContent === selected) + 'font-size:15px;padding:6px 12px;';
    });

  for (const cat of CATEGORIES) {
    const btn = el('button', '', cat);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      selected = cat;
      refreshCats();
    });
    catBtns.push(btn);
    catRow.appendChild(btn);
  }
  refreshCats();
  box.appendChild(catRow);

  box.appendChild(el('div', STYLES.label, '具体说说（在哪一关、发生了什么、希望怎样）'));
  const textarea = el('textarea', STYLES.input + 'min-height:110px;resize:vertical;');
  textarea.placeholder = '比如：KET 第 3 单元拼写关，字母块点了没反应……';
  box.appendChild(textarea);

  box.appendChild(el('div', STYLES.label, '联系方式（选填，方便回复你）'));
  const contactInput = el('input', STYLES.input);
  contactInput.placeholder = '微信号或邮箱';
  box.appendChild(contactInput);

  const attachLabel = el('label', 'display:flex;align-items:center;gap:8px;font-size:14px;');
  const attachCheck = el('input', 'width:20px;height:20px;');
  attachCheck.type = 'checkbox';
  attachCheck.checked = true;
  attachLabel.appendChild(attachCheck);
  attachLabel.appendChild(el('span', '', '附上设备信息和最近的学习记录（帮助定位问题，不含个人信息）'));
  box.appendChild(attachLabel);

  const status = el('div', 'font-size:14px;min-height:20px;color:#2fa866;line-height:1.5;');
  box.appendChild(status);

  const btnRow = el('div', 'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;');
  const close = () => {
    feedbackOpen = false;
    shade.remove();
  };
  const sendBtn = el('button', STYLES.btn(true), '发送');
  const closeBtn = el('button', STYLES.btn(false), '关闭');
  btnRow.append(sendBtn, closeBtn);
  box.appendChild(btnRow);
  shade.appendChild(box);

  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) {
    shade.addEventListener(ev, (e) => e.stopPropagation());
  }
  closeBtn.addEventListener('click', close);

  const buildPayload = () => {
    const engine = ctx().engine;
    const details = attachCheck.checked
      ? formatStatsText(computeStats(engine, ctx().platform.now()), engine, '')
      : '（未附学习记录）';
    return {
      type: selected,
      message: textarea.value.trim(),
      contact: contactInput.value.trim(),
      tester: testerId(),
      device: deviceSummary(),
      details,
    };
  };

  const formatPlain = (p: ReturnType<typeof buildPayload>) =>
    `【单词守卫反馈 · ${p.type}】\n${p.message}\n联系方式：${p.contact || '无'}\n测试者：${p.tester}\n设备：${p.device}\n\n${p.details}`;

  const fallbackCopy = (payload: ReturnType<typeof buildPayload>, reason: string) => {
    status.style.color = '#c0392b';
    status.textContent = `${reason}。可以点"复制反馈"，粘贴到微信发给邀请你测试的人。`;
    sendBtn.textContent = '复制反馈';
    sendBtn.onclick = async () => {
      const ok = await copyText(formatPlain(payload));
      status.style.color = ok ? '#2fa866' : '#c0392b';
      status.textContent = ok ? '已复制，去微信粘贴发送吧' : '复制失败，请截图发送';
    };
  };

  sendBtn.onclick = async () => {
    const payload = buildPayload();
    if (!payload.message) {
      status.style.color = '#c0392b';
      status.textContent = '请先写一下具体内容';
      textarea.focus();
      return;
    }
    sendBtn.disabled = true;
    status.style.color = '#7a5a40';
    status.textContent = '发送中…';
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 12_000);
      const res = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ _subject: `单词守卫反馈：${payload.type}（${payload.tester}）`, ...payload }),
        signal: ctrl.signal,
      });
      window.clearTimeout(timer);
      sendBtn.disabled = false;
      if (!res.ok) throw new Error(String(res.status));
      status.style.color = '#2fa866';
      status.textContent = '已发送，谢谢你的反馈！';
      track('feedback_sent', { type: payload.type });
      sendBtn.textContent = '再写一条';
      sendBtn.onclick = () => {
        close();
        openFeedbackDialog();
      };
      textarea.value = '';
    } catch {
      sendBtn.disabled = false;
      fallbackCopy(payload, '发送失败（可能是网络不通）');
    }
  };

  document.body.appendChild(shade);
}
