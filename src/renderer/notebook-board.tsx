import { useLocale } from './i18n';
import { useState } from 'react';
import { Excalidraw, MainMenu, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH: string;
  }
}
window.EXCALIDRAW_ASSET_PATH = new URL('./excalidraw/', document.baseURI).href;
export default function NotebookBoard({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const locale = useLocale();
  const [initial] = useState<ExcalidrawInitialDataState>(() => (value ? JSON.parse(value) : {}));
  return (
    <div className="notebook-board">
      <Excalidraw
        initialData={initial}
        langCode={locale === 'en' ? 'en' : 'zh-CN'}
        detectScroll
        onChange={(elements, state, files) => {
          const serialized = serializeAsJSON(elements, state, files, 'local');
          if (elements.length || value) onChange(serialized);
        }}
        onLinkOpen={(_element, event) => event.preventDefault()}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            saveAsImage: false,
            toggleTheme: false,
          },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
