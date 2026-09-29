import { useEffect, useRef, useState, type DragEvent } from 'react';

interface UseFileDropOptions {
  accept: string[]; // 받을 확장자, 소문자에 점 포함 ('.pdf')
  onFile: (file: File) => void; // 클릭해서 골랐을 때와 같은 함수를 넘긴다
  onReject?: (file: File) => void; // 받지 않는 파일을 놓았을 때
  disabled?: boolean; // 올리는 중 등. 이때 놓은 파일은 무시한다
}

// 폴더나 바탕화면에서 파일을 끌어다 놓아 올리기. 돌려주는 bind 를 놓을 자리(div)에 펼쳐 붙인다.
//  - "파일"을 끌 때만 반응한다. 페이지 안의 글자를 끌어 옮기는 건 원래대로 둔다.
//  - 안쪽 요소(글자, 아이콘)를 지날 때마다 dragenter/dragleave 가 번갈아 와서 강조가 깜빡이므로 횟수로 센다.
//  - 놓을 자리를 살짝 벗어나 떨어뜨리면 브라우저가 그 파일을 열어버려 작업 중인 화면이 날아간다.
//    그래서 이 훅을 쓰는 화면이 떠 있는 동안은 창 전체에서 파일 놓기의 기본 동작을 막는다.
export function useFileDrop({ accept, onFile, onReject, disabled = false }: UseFileDropOptions) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const block = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');

  const bind = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e) || disabled) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // 이걸 해야 drop 이 온다
      e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e) || disabled) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (disabled) return;
      // 여러 개를 놓으면 받을 수 있는 첫 파일만 쓴다
      const files = [...e.dataTransfer.files];
      const file = files.find((f) => accept.some((ext) => f.name.toLowerCase().endsWith(ext)));
      if (file) onFile(file);
      else if (files[0]) onReject?.(files[0]);
    },
  };

  return { dragging, bind };
}
