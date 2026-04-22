const SlideEdgeNavControls = ({ isPrevEnabled, isNextEnabled, onGoPrev, onGoNext }: any) => {
  return (
    <div className="slide-page-edge-nav-root">
      <div className="slide-page-edge-nav-zone slide-page-edge-nav-zone-left">
        <button
          className="slide-page-edge-nav-btn"
          type="button"
          disabled={!isPrevEnabled}
          onClick={onGoPrev}
        >
          <svg
            className="slide-page-edge-nav-icon"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M7.6 2.2L3.8 6l3.8 3.8" />
          </svg>
        </button>
      </div>
      <div className="slide-page-edge-nav-zone slide-page-edge-nav-zone-right">
        <button
          className="slide-page-edge-nav-btn"
          type="button"
          disabled={!isNextEnabled}
          onClick={onGoNext}
        >
          <svg
            className="slide-page-edge-nav-icon"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <path d="M4.4 2.2L8.2 6l-3.8 3.8" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default SlideEdgeNavControls;
