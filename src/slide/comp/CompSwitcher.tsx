import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

const SWITCHER_FILTER_REGEX = /^\/[0-9a-zA-Z_-]*$/;

const CompSwitcher = observer(({
  textValue,
  availableCompNames,
  isReadOnly,
  onChangeText,
  onCancel,
  onConfirm,
}: any) => {
  const inputRef = useRef<any>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(-1);
  const prevOptionCountRef = useRef<number>(0);
  const safeTextValue = `${textValue ?? ''}`;

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.focus();
    const textLength = `${element.value ?? ''}`.length;
    element.setSelectionRange?.(textLength, textLength);
  }, []);

  const queryInfo = useMemo(() => {
    const isSlashMode = SWITCHER_FILTER_REGEX.test(safeTextValue);
    if (!isSlashMode) return { isSlashMode: false, keyword: '' };
    const keyword = safeTextValue.startsWith('/') ? safeTextValue.slice(1).toLowerCase() : '';
    return { isSlashMode: true, keyword };
  }, [safeTextValue]);

  const options = useMemo(() => {
    if (!queryInfo.isSlashMode) return [];
    return availableCompNames
      .map((compName) => {
        const optionName = compName.replace(/^Comp/, '');
        const optionNameLower = optionName.toLowerCase();
        const matchStart = queryInfo.keyword ? optionNameLower.indexOf(queryInfo.keyword) : -1;
        const matchLength = queryInfo.keyword ? queryInfo.keyword.length : 0;
        return { compName, optionName, matchStart, matchLength };
      })
      .filter((option) => {
        if (!queryInfo.keyword) return true;
        return option.matchStart >= 0;
      });
  }, [availableCompNames, queryInfo.isSlashMode, queryInfo.keyword]);

  useEffect(() => {
    const optionCount = options.length;
    const prevOptionCount = prevOptionCountRef.current;
    prevOptionCountRef.current = optionCount;
    if (optionCount === 1) {
      setSelectedOptionIndex(0);
      return;
    }
    if (prevOptionCount === 1 && optionCount > 1) {
      setSelectedOptionIndex(-1);
      return;
    }
    if (optionCount === 0) {
      setSelectedOptionIndex(-1);
      return;
    }
    if (selectedOptionIndex >= optionCount) {
      setSelectedOptionIndex(optionCount - 1);
    }
  }, [options.length, selectedOptionIndex]);

  const requestConfirmTextSingleline = () => {
    const nextTextValue = safeTextValue.startsWith('/') ? safeTextValue.slice(1) : safeTextValue;
    onConfirm?.({
      compName: 'CompTextSingleline',
      compData: {
        text: nextTextValue,
        initialPixelSize: { pixelX: 200, pixelY: 24 },
        fontScale: 1,
        fontScaleUnit: '1/100 slide width',
      },
    });
  };

  const requestBecomeSelectedOption = () => {
    const selectedOption = options[selectedOptionIndex];
    if (!selectedOption) {
      requestConfirmTextSingleline();
      return;
    }
    onConfirm?.({
      compName: selectedOption.compName,
    });
  };

  const renderOptionLabel = (option: any) => {
    if (!queryInfo.keyword || option.matchStart < 0 || option.matchLength <= 0) {
      return option.optionName;
    }
    const start = option.matchStart;
    const end = start + option.matchLength;
    return (
      <>
        {option.optionName.slice(0, start)}
        <span className="slide-switcher-option-mark">{option.optionName.slice(start, end)}</span>
        {option.optionName.slice(end)}
      </>
    );
  };

  return (
    <div className="slide-switcher-root">
      <input
        ref={inputRef}
        className="slide-switcher-input"
        readOnly={isReadOnly}
        value={safeTextValue}
        onChange={(event) => {
          if (isReadOnly) return;
          onChangeText?.(event.target.value);
        }}
        onBlur={() => {
          if (isReadOnly) return;
          if (!safeTextValue.trim()) {
            onCancel?.();
            return;
          }
          requestConfirmTextSingleline();
        }}
        onKeyDown={(event) => {
          if (!queryInfo.isSlashMode) {
            if (event.key === 'Enter') {
              event.preventDefault();
              requestConfirmTextSingleline();
            }
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (options.length === 0) return;
            if (selectedOptionIndex < 0) {
              setSelectedOptionIndex(0);
              return;
            }
            setSelectedOptionIndex((selectedOptionIndex + 1) % options.length);
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (options.length === 0) return;
            if (selectedOptionIndex < 0) {
              setSelectedOptionIndex(options.length - 1);
              return;
            }
            setSelectedOptionIndex((selectedOptionIndex - 1 + options.length) % options.length);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            requestBecomeSelectedOption();
          }
        }}
      />
      {queryInfo.isSlashMode ? (
        <div className="slide-switcher-options">
          {options.length > 0 ? (
            options.map((option, optionIndex) => (
              <button
                key={option.compName}
                className={`slide-switcher-option ${optionIndex === selectedOptionIndex ? 'is-selected' : ''}`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setSelectedOptionIndex(optionIndex);
                  onConfirm?.({ compName: option.compName });
                }}
              >
                {renderOptionLabel(option)}
              </button>
            ))
          ) : (
            <div className="slide-switcher-empty">no available options</div>
          )}
        </div>
      ) : null}
    </div>
  );
});

export default CompSwitcher;
