import { sanitizePetName } from '../core/learning/engine';
import { track } from './analytics';
import { ctx } from './context';
import { isDialogOpen, openTextDialog } from './ui/dialog';

export function openPetNameDialog(onSaved?: () => void): void {
  const pet = ctx().engine.data.pet;
  if (!pet || isDialogOpen()) return;
  openTextDialog({
    title: pet.name ? '给小伙伴改个名字' : '给小伙伴起个名字',
    message: '最多 8 个字，中文、英文都可以。',
    text: pet.name ?? '',
    readOnly: false,
    short: true,
    placeholder: '比如：豆豆、Lucky',
    buttons: [
      {
        label: '就叫这个',
        primary: true,
        onClick: async (val, setStatus) => {
          const clean = sanitizePetName(val);
          if (!clean) {
            setStatus('先写一个名字吧');
            return false;
          }
          pet.name = clean;
          await ctx().save();
          track('pet_named');
          onSaved?.();
          return true;
        },
      },
    ],
  });
}
