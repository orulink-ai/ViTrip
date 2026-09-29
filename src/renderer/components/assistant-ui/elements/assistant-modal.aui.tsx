'use client';

import { MessageCircleIcon, MinusIcon } from 'lucide-react';

import {
  type ComponentPropsWithoutRef,
  type FC,
  type ReactNode,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuiEvent } from '@assistant-ui/react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

import { TooltipIconButton } from './tooltip-icon-button';

type ModalView = 'thread' | 'list';

type ModalSize = { readonly width: number; readonly height: number };

type ResizeDrag = {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly direction: 1 | -1;
  last: ModalSize | null;
};

const SIZE_STORAGE_KEY = 'aui-modal-size';
const MIN_SIZE: ModalSize = { width: 320, height: 400 };
// The trigger and its offsets sit below the modal, so the height leaves room for them.
const VIEWPORT_INSET: ModalSize = { width: 32, height: 96 };
const RESIZE_STEP = 16;

const clampSize = ({ width, height }: ModalSize): ModalSize => ({
  width: Math.round(
    Math.max(MIN_SIZE.width, Math.min(width, window.innerWidth - VIEWPORT_INSET.width)),
  ),
  height: Math.round(
    Math.max(MIN_SIZE.height, Math.min(height, window.innerHeight - VIEWPORT_INSET.height)),
  ),
});

const readStoredSize = (): ModalSize | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(SIZE_STORAGE_KEY) ?? 'null');
    if (typeof stored !== 'object' || stored === null) return null;
    const { width, height } = stored as Record<string, unknown>;
    if (typeof width !== 'number' || typeof height !== 'number') return null;
    return clampSize({ width, height });
  } catch {
    return null;
  }
};

const storeSize = (size: ModalSize | null) => {
  try {
    if (size) {
      window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(size));
    } else {
      window.localStorage.removeItem(SIZE_STORAGE_KEY);
    }
  } catch {
    // Without storage the size lasts until the page reloads.
  }
};

const isRtl = (element: Element) => getComputedStyle(element).direction === 'rtl';

const useModalSize = (contentRef: RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState(readStoredSize);
  const dragRef = useRef<ResizeDrag | null>(null);

  const commitSize = (next: ModalSize | null) => {
    setSize(next);
    storeSize(next);
  };

  const sizeFromPointer = (drag: ResizeDrag, event: PointerEvent<HTMLElement>) =>
    clampSize({
      width: drag.width - (event.clientX - drag.x) * drag.direction,
      height: drag.height - (event.clientY - drag.y),
    });

  const takeDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return null;
    dragRef.current = null;
    return drag;
  };

  const reset = () => {
    dragRef.current = null;
    commitSize(null);
  };

  return {
    size,
    reset,
    handleProps: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        const content = contentRef.current;
        if (event.button !== 0 || !content) return;
        const rect = content.getBoundingClientRect();
        dragRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          width: rect.width,
          height: rect.height,
          direction: isRtl(content) ? -1 : 1,
          last: null,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.last && event.clientX === drag.x && event.clientY === drag.y) return;
        drag.last = sizeFromPointer(drag, event);
        setSize(drag.last);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const drag = takeDrag(event);
        if (!drag) return;
        if (drag.last || event.clientX !== drag.x || event.clientY !== drag.y) {
          commitSize(sizeFromPointer(drag, event));
        }
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        const drag = takeDrag(event);
        if (drag?.last) commitSize(drag.last);
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const content = contentRef.current;
        if (!content) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          reset();
          return;
        }
        const step = event.shiftKey ? RESIZE_STEP * 4 : RESIZE_STEP;
        const rtl = isRtl(content);
        const changes: Record<string, readonly [number, number]> = {
          ArrowUp: [0, step],
          ArrowDown: [0, -step],
          [rtl ? 'ArrowRight' : 'ArrowLeft']: [step, 0],
          [rtl ? 'ArrowLeft' : 'ArrowRight']: [-step, 0],
        };
        const change = changes[event.key];
        if (!change) return;
        event.preventDefault();
        const rect = content.getBoundingClientRect();
        commitSize(
          clampSize({
            width: rect.width + change[0],
            height: rect.height + change[1],
          }),
        );
      },
    },
  };
};

export const AssistantModal: FC<{
  children: ReactNode;
  openRequest?: unknown;
  title: string;
  expandLabel?: string;
  collapseLabel?: string;
  onOpenChange?: (open: boolean) => void;
}> = ({
  children,
  title,
  onOpenChange,
  openRequest,
  expandLabel = 'Open Assistant',
  collapseLabel = 'Close Assistant',
}) => {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (openRequest) setOpen(true);
  }, [openRequest]);
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const move = (dx: number, dy: number) => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    setOffset((value) => ({
      x: value.x + Math.max(8 - rect.left, Math.min(dx, window.innerWidth - rect.right - 8)),
      y: value.y + Math.max(60 - rect.top, Math.min(dy, window.innerHeight - rect.bottom - 8)),
    }));
  };
  useEffect(() => {
    const resetPosition = () => setOffset({ x: 0, y: 0 });
    window.addEventListener('resize', resetPosition);
    return () => window.removeEventListener('resize', resetPosition);
  }, []);
  const [view, setView] = useState<ModalView>('thread');
  const contentRef = useRef<HTMLDivElement>(null);
  const { size, reset, handleProps } = useModalSize(contentRef);
  const thread = children;

  useAuiEvent('thread.runStart', () => {
    setView('thread');
    setOpen(true);
  });

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(open, eventDetails) => {
        if (
          !open &&
          (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out')
        ) {
          eventDetails.cancel();
        } else {
          if (open) setView('thread');
          setOpen(open);
        }
      }}
    >
      <PopoverPrimitive.Portal keepMounted>
        <div className="aui-root aui-modal-anchor fixed end-4 bottom-4 z-50 size-11">
          <PopoverPrimitive.Trigger
            render={(props, state) => (
              <AssistantModalButton
                {...props}
                open={state.open}
                expandLabel={expandLabel}
                collapseLabel={collapseLabel}
              />
            )}
          />
        </div>
        <PopoverPrimitive.Positioner
          side="top"
          align="end"
          sideOffset={16}
          positionMethod="fixed"
          className="isolate z-50 data-closed:hidden"
        >
          <PopoverPrimitive.Popup
            ref={contentRef}
            style={{ ...size, translate: `${offset.x}px ${offset.y}px` }}
            className="data-closed:hidden group/modal aui-root aui-modal-content bg-popover text-popover-foreground data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:slide-out-to-bottom-2 [&[data-open]_.aui-thread-viewport-footer]:animate-in [&[data-open]_.aui-thread-viewport-footer]:fade-in-0 [&[data-open]_.aui-thread-viewport-footer]:slide-in-from-bottom-2 [&[data-open]_.aui-thread-viewport-footer]:fill-mode-backwards [&_.aui-thread-viewport-footer]:bg-popover ring-foreground/10 z-50 flex h-125 max-h-(--available-height) w-100 max-w-[calc(100vw-2rem)] origin-(--transform-origin) flex-col gap-0 overflow-clip overscroll-contain rounded-xl p-0 text-base antialiased shadow-[0_16px_48px_-24px_rgb(0_0_0/0.25)] ring-1 transition-none ease-[cubic-bezier(0.32,0.72,0,1)] outline-none data-closed:duration-200 data-open:duration-300 motion-reduce:animate-none dark:shadow-[0_16px_48px_-24px_rgb(0_0_0/0.6)] [&_.aui-thread-root]:bg-inherit motion-reduce:[&_.aui-thread-viewport-footer]:animate-none [&_[data-slot=aui\_thread-viewport]]:[scrollbar-gutter:stable_both-edges] [&[data-open]_.aui-thread-viewport-footer]:delay-100 [&[data-open]_.aui-thread-viewport-footer]:duration-300 [&[data-open]_.aui-thread-viewport-footer]:ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            <AssistantModalResizeHandle {...handleProps} onDoubleClick={reset} />
            <div className="aui-modal-header border-foreground/10 flex h-11 shrink-0 items-center gap-2 border-b ps-3.5 pe-2">
              <PopoverPrimitive.Title className="sr-only">{title}</PopoverPrimitive.Title>
              <button
                type="button"
                aria-label="移动聊天窗口"
                className="min-w-0 flex-1 cursor-move touch-none truncate text-left text-[13px] font-medium"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  drag.current = { x: event.clientX, y: event.clientY };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  if (!drag.current) return;
                  move(event.clientX - drag.current.x, event.clientY - drag.current.y);
                  drag.current = { x: event.clientX, y: event.clientY };
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onKeyDown={(event) => {
                  const delta: Record<string, [number, number]> = {
                    ArrowLeft: [-24, 0],
                    ArrowRight: [24, 0],
                    ArrowUp: [0, -24],
                    ArrowDown: [0, 24],
                  };
                  if (delta[event.key]) {
                    event.preventDefault();
                    move(...delta[event.key]);
                  }
                }}
              >
                {title}
              </button>
              <TooltipIconButton
                tooltip={collapseLabel}
                aria-label={collapseLabel}
                onClick={() => {
                  setOpen(false);
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLButtonElement>('.aui-modal-button')?.focus(),
                  );
                }}
              >
                <MinusIcon />
              </TooltipIconButton>
            </div>
            <div className="aui-modal-body relative min-h-0 flex-1">
              <div
                ref={(node) => {
                  if (node) node.inert = view === 'list';
                }}
                className="aui-modal-thread h-full"
              >
                {thread}
              </div>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};

const AssistantModalResizeHandle: FC<ComponentPropsWithoutRef<'button'>> = (props) => {
  return (
    <button
      type="button"
      aria-label="Resize Assistant"
      className="aui-modal-resize-handle group-hover/modal:border-foreground/15 hover:border-foreground/40 focus-visible:border-ring absolute start-0 top-0 z-10 size-6 cursor-nwse-resize touch-none rounded-ss-xl border-s-2 border-t-2 border-transparent transition-colors outline-none [clip-path:polygon(0_0,100%_0,100%_6px,6px_6px,6px_100%,0_100%)] motion-reduce:transition-none rtl:cursor-nesw-resize rtl:[clip-path:polygon(0_0,100%_0,100%_100%,calc(100%_-_6px)_100%,calc(100%_-_6px)_6px,0_6px)]"
      {...props}
    />
  );
};

type AssistantModalButtonProps = Omit<
  ComponentPropsWithoutRef<typeof TooltipIconButton>,
  'tooltip'
> & {
  open: boolean;
  expandLabel: string;
  collapseLabel: string;
};

const AssistantModalButton = forwardRef<HTMLButtonElement, AssistantModalButtonProps>(
  ({ open, expandLabel, collapseLabel, ...rest }, ref) => {
    const tooltip = open ? collapseLabel : expandLabel;

    return (
      <TooltipIconButton
        variant="ghost"
        tooltip={tooltip}
        side="left"
        {...rest}
        aria-label={tooltip}
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : 0}
        style={{ opacity: open ? 0 : 1, pointerEvents: open ? 'none' : 'auto' }}
        className="aui-modal-button bg-background text-foreground border-border/60 hover:border-border hover:bg-background size-full rounded-full border transition-[border-color,scale] duration-150 ease-out active:scale-96 motion-reduce:transition-none"
        ref={ref}
      >
        <MessageCircleIcon className="size-5" />
        <span className="aui-sr-only sr-only">{tooltip}</span>
      </TooltipIconButton>
    );
  },
);

AssistantModalButton.displayName = 'AssistantModalButton';
