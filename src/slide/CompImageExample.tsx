import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import Menu from '@wwf971/react-comp-misc/Menu';
import { useSlideStore } from './contentStore';

const CompImageExample = observer(
  ({ data, containerId, requestContainerMoveByPointer }: any) => {
  const store = useSlideStore();
  const [menuPosition, setMenuPosition] = useState(null);
  const isCover = data?.isCover === true;
  const imageUrl = data?.imageUrl ?? '';
  const containerSize = store.getContainerSize(containerId);

  return (
    <div
      className="slide-image-root"
      onPointerDown={(event) => {
        if (!requestContainerMoveByPointer) return;
        requestContainerMoveByPointer(event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuPosition({
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      <img
        src={imageUrl}
        className="slide-image-content"
        style={{ objectFit: isCover ? 'cover' : 'contain' }}
      />
      <div className="slide-image-size">
        {containerSize.pixelX} x {containerSize.pixelY}
      </div>
      {menuPosition && (
        <Menu
          position={menuPosition}
          onClose={() => setMenuPosition(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuPosition({
              x: event.clientX,
              y: event.clientY,
            });
          }}
          onItemClick={(item) => {
            if (item?.name === 'Fill container') {
              store.requestContainerCompDataUpdate(containerId, { isCover: true });
            }
            if (item?.name === 'Show entire image') {
              store.requestContainerCompDataUpdate(containerId, { isCover: false });
            }
          }}
          items={[
            {
              type: 'item',
              name: 'Fill container',
              disabled: isCover,
            },
            {
              type: 'item',
              name: 'Show entire image',
              disabled: !isCover,
            },
          ]}
        />
      )}
    </div>
  );
});

export default CompImageExample;
