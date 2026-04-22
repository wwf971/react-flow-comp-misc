import { useEffect, useRef, useState } from 'react';
import { LeftIcon, RightIcon, DownIcon } from '@wwf971/react-comp-misc/Icon';

const Header = ({
  isHidden,
  slideItems,
  currentSlideId,
  currentSlideName,
  isSettingBusy,
  isPersisting,
  currentPageIndex,
  totalPage,
  isCurrentPageDirty,
  persistFailureMessage,
  hasPrevPage,
  hasNextPage,
  onSwitchSlide,
  onRenameSlide,
  onCreateSlide,
  onDeleteSlide,
  onReinitDatabase,
  onGoPrevPage,
  onGoNextPage,
}: any) => {
  const LeftIco = LeftIcon as any;
  const RightIco = RightIcon as any;
  const DownIco = DownIcon as any;
  const [isRenameEditing, setIsRenameEditing] = useState(false);
  const renameRef = useRef<any>(null);
  const [isSlideDropdownOpen, setIsSlideDropdownOpen] = useState(false);
  const dropdownRef = useRef<any>(null);

  useEffect(() => {
    setIsRenameEditing(false);
    setIsSlideDropdownOpen(false);
    const element = renameRef.current;
    if (!element) return;
    element.textContent = currentSlideName ?? '';
  }, [currentSlideId, currentSlideName]);

  useEffect(() => {
    if (!isSlideDropdownOpen) return undefined;
    const onPointerDown = (event) => {
      const rootElement = dropdownRef.current;
      if (!rootElement) return;
      if (rootElement.contains(event.target)) return;
      setIsSlideDropdownOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isSlideDropdownOpen]);

  const requestCommitRename = () => {
    const element = renameRef.current;
    if (!element) return;
    const nextName = `${element.textContent ?? ''}`.trim();
    const safeCurrentName = `${currentSlideName ?? ''}`.trim();
    if (!nextName) {
      element.textContent = safeCurrentName;
      setIsRenameEditing(false);
      return;
    }
    if (nextName !== safeCurrentName) {
      onRenameSlide?.(nextName);
    }
    setIsRenameEditing(false);
  };

  return (
    <div className={`slide-system-toolbar ${isHidden ? 'is-hidden' : ''}`}>
      <div className="slide-toolbar-settings">
        <div
          ref={dropdownRef}
          className={`slide-rename-root ${isRenameEditing ? 'is-editing' : ''}`}
        >
          <div
            ref={renameRef}
            className="slide-rename-contenteditable"
            contentEditable={isRenameEditing && !isSettingBusy}
            suppressContentEditableWarning
            onClick={() => {
              if (isSettingBusy || !currentSlideId) return;
              if (isRenameEditing) return;
              setIsRenameEditing(true);
              requestAnimationFrame(() => {
                const element = renameRef.current;
                if (!element) return;
                element.focus();
                const selection = window.getSelection();
                if (!selection) return;
                const range = document.createRange();
                range.selectNodeContents(element);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
              });
            }}
            onBlur={() => {
              if (!isRenameEditing) return;
              requestCommitRename();
            }}
            onKeyDown={(event) => {
              if (!isRenameEditing) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                requestCommitRename();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                if (renameRef.current) {
                  renameRef.current.textContent = currentSlideName ?? '';
                }
                setIsRenameEditing(false);
              }
            }}
          >
            {currentSlideName ?? ''}
          </div>
          <button
            className="slide-rename-dropdown-btn"
            type="button"
            disabled={isSettingBusy || slideItems.length === 0}
            onClick={() => {
              if (isSettingBusy || slideItems.length === 0) return;
              setIsSlideDropdownOpen((isOpen) => !isOpen);
            }}
          >
            <DownIco width={10} height={10} />
          </button>
          {isSlideDropdownOpen ? (
            <div className="slide-rename-dropdown-list">
              {slideItems.map((item: any) => (
                <button
                  key={item.id}
                  className={`slide-rename-dropdown-item ${item.id === currentSlideId ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => {
                    onSwitchSlide?.(item.id);
                    setIsSlideDropdownOpen(false);
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          className="slide-toolbar-btn"
          type="button"
          disabled={isSettingBusy}
          onClick={() => {
            onCreateSlide?.();
          }}
        >
          New
        </button>
        <button
          className="slide-toolbar-btn"
          type="button"
          disabled={isSettingBusy || !currentSlideId}
          onClick={() => {
            onDeleteSlide?.();
          }}
        >
          Delete Slide
        </button>
        <button
          className="slide-toolbar-btn"
          type="button"
          disabled={isSettingBusy}
          onClick={() => {
            onReinitDatabase?.();
          }}
        >
          Reinit DB
        </button>
      </div>
      <div className="slide-toolbar-page">
        <span className="slide-toolbar-page-value">{currentPageIndex}</span>
        <span className="slide-toolbar-page-value">{isCurrentPageDirty ? '*' : ''}</span>
        <span className="slide-toolbar-page-sep">/</span>
        <span className="slide-toolbar-page-value">{totalPage}</span>
        <span className={`slide-toolbar-saving ${isPersisting ? 'is-visible' : ''}`}>saving</span>
        <span className="slide-toolbar-save-fail">{persistFailureMessage}</span>
      </div>
      <div className="slide-toolbar-page-nav">
        <button
          className="slide-toolbar-icon-btn"
          type="button"
          disabled={!hasPrevPage}
          onClick={() => onGoPrevPage?.()}
        >
          <LeftIco width={12} height={12} />
        </button>
        <button
          className="slide-toolbar-icon-btn"
          type="button"
          disabled={!hasNextPage}
          onClick={() => onGoNextPage?.()}
        >
          <RightIco width={12} height={12} />
        </button>
      </div>
    </div>
  );
};

export default Header;
