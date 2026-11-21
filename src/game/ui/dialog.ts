export interface DialogButton {
  label: string;
  primary?: boolean;
  onClick: (value: string, setStatus: (msg: string) => void) => boolean | void | Promise<boolean | void>;
}

export interface DialogOptions {
  title: string;
  message?: string;
  text?: string;
  readOnly: boolean;
  short?: boolean;
  placeholder?: string;
  buttons: DialogButton[];
}

let dialogOpen = false;

export function isDialogOpen(): boolean {
  return dialogOpen;
}

export function openTextDialog(opts: DialogOptions): void {
  if (dialogOpen) return;
  dialogOpen = true;

  const shade = document.createElement('div');
  shade.style.cssText =
    'position:fixed;inset:0;z-index:1000;background:rgba(58,40,24,.5);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;';

  const box = document.createElement('div');
  box.style.cssText =
    'background:#fff4dc;border:4px solid #4a3426;border-radius:18px;max-width:560px;width:100%;max-height:90vh;display:flex;flex-direction:column;gap:10px;padding:18px;box-sizing:border-box;color:#4a3426;';

  const title = document.createElement('div');
  title.textContent = opts.title;
  title.style.cssText = 'font-size:22px;font-weight:700;';
  box.appendChild(title);

  if (opts.message) {
    const msg = document.createElement('div');
    msg.textContent = opts.message;
    msg.style.cssText = 'font-size:15px;line-height:1.5;color:#7a5a40;';
    box.appendChild(msg);
  }

  const input = document.createElement('textarea');
  input.value = opts.text ?? '';
  input.readOnly = opts.readOnly;
  input.placeholder = opts.placeholder ?? '';
  input.style.cssText =
    'width:100%;min-height:160px;flex:1;font-size:13px;line-height:1.4;font-family:ui-monospace,Menlo,monospace;border:2px solid #c9b99c;border-radius:10px;padding:8px;box-sizing:border-box;background:#fff;color:#4a3426;resize:vertical;';
  if (opts.short) {
    input.rows = 1;
    input.maxLength = 16;
    input.style.minHeight = '54px';
    input.style.flex = '0 0 auto';
    input.style.fontSize = '24px';
    input.style.fontFamily = 'inherit';
    input.style.textAlign = 'center';
    input.style.resize = 'none';
  }
  box.appendChild(input);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:14px;min-height:20px;color:#2fa866;';
  box.appendChild(status);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;';

  const close = () => {
    dialogOpen = false;
    shade.remove();
  };
  const setStatus = (msg: string) => {
    status.textContent = msg;
  };

  for (const btnDef of [...opts.buttons, { label: '关闭', onClick: () => undefined }]) {
    const btn = document.createElement('button');
    btn.textContent = btnDef.label;
    btn.style.cssText = `font-size:17px;padding:10px 18px;border-radius:12px;border:3px solid #4a3426;cursor:pointer;background:${btnDef.primary ? '#f08a3c' : '#fff'};color:${btnDef.primary ? '#fff' : '#4a3426'};font-weight:600;`;
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if ((await btnDef.onClick(input.value, setStatus)) !== false) close();
    });
    row.appendChild(btn);
  }

  box.appendChild(row);
  shade.appendChild(box);

  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) {
    shade.addEventListener(ev, (e) => e.stopPropagation());
  }
  document.body.appendChild(shade);
  if (opts.readOnly) {
    input.focus();
    input.select();
  }
}

export async function copyText(text: string, existingArea?: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = existingArea ?? document.createElement('textarea');
      if (!existingArea) {
        area.value = text;
        document.body.appendChild(area);
      }
      area.select();
      const ok = document.execCommand('copy');
      if (!existingArea) area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
