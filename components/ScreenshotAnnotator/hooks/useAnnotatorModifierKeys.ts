import { useEffect, useRef, useState } from 'react';

export function useAnnotatorModifierKeys(isActive: boolean) {
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const [isCtrlSelectHeld, setIsCtrlSelectHeld] = useState(false);
  const [isDuplicateCursor, setIsDuplicateCursor] = useState(false);

  const spaceRef = useRef(false);
  const ctrlRef = useRef(false);

  useEffect(() => {
    if (!isActive) {
      spaceRef.current = false;
      ctrlRef.current = false;
      setIsSpaceHeld(false);
      setIsCtrlSelectHeld(false);
      setIsDuplicateCursor(false);
      return;
    }

    const isCtrlEvent = (e: KeyboardEvent) =>
      e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight';
    const isShiftEvent = (e: KeyboardEvent) =>
      e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight';

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' && !e.repeat) {
        spaceRef.current = true;
        setIsSpaceHeld(true);
      } else if (isCtrlEvent(e)) {
        if (!ctrlRef.current) {
          ctrlRef.current = true;
          setIsCtrlSelectHeld(true);
        }
        setIsDuplicateCursor(e.shiftKey);
      } else if (isShiftEvent(e) && (ctrlRef.current || e.ctrlKey)) {
        setIsDuplicateCursor(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setIsSpaceHeld(false);
      } else if (isCtrlEvent(e)) {
        ctrlRef.current = false;
        setIsCtrlSelectHeld(false);
        setIsDuplicateCursor(false);
      } else if (isShiftEvent(e)) {
        setIsDuplicateCursor(false);
      }
    };

    const onBlur = () => {
      spaceRef.current = false;
      ctrlRef.current = false;
      setIsSpaceHeld(false);
      setIsCtrlSelectHeld(false);
      setIsDuplicateCursor(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isActive]);

  return {
    spaceRef,
    ctrlRef,
    isSpaceHeld,
    isCtrlSelectHeld,
    isDuplicateCursor,
  };
}
