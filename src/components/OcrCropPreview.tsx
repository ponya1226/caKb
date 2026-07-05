import { useRef, useState } from "react";
import type { OcrCropRatios } from "../lib/ocr";
import { getPairedCropSide, MAX_COMBINED_CROP_PERCENT } from "../lib/ocrCrop";

type DragTarget = keyof OcrCropRatios | "move";

type DragState = {
  target: DragTarget;
  startPointer: {
    x: number;
    y: number;
  };
  startCrop: OcrCropRatios;
};

type OcrCropPreviewProps = {
  imageSrc: string;
  imageAlt: string;
  crop: OcrCropRatios;
  compact?: boolean;
  onCropChange?: (crop: OcrCropRatios) => void;
};

const sideLabels: Record<keyof OcrCropRatios, string> = {
  top: "上",
  right: "右",
  bottom: "下",
  left: "左",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundPercent(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function clampCrop(crop: OcrCropRatios): OcrCropRatios {
  const nextCrop = { ...crop };

  (Object.keys(nextCrop) as Array<keyof OcrCropRatios>).forEach((side) => {
    const pairedSide = getPairedCropSide(side);
    nextCrop[side] = roundPercent(nextCrop[side]);
    if (nextCrop[side] + nextCrop[pairedSide] > MAX_COMBINED_CROP_PERCENT) {
      nextCrop[side] = MAX_COMBINED_CROP_PERCENT - nextCrop[pairedSide];
    }
  });

  return nextCrop;
}

function getPointerPercent(event: React.PointerEvent<HTMLElement>, element: HTMLElement): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
  };
}

function getResizedCrop(target: keyof OcrCropRatios, pointer: { x: number; y: number }, drag: DragState): OcrCropRatios {
  const nextCrop = { ...drag.startCrop };
  const deltaX = pointer.x - drag.startPointer.x;
  const deltaY = pointer.y - drag.startPointer.y;

  if (target === "top") {
    nextCrop.top = clamp(drag.startCrop.top + deltaY, 0, MAX_COMBINED_CROP_PERCENT - drag.startCrop.bottom);
  }

  if (target === "bottom") {
    nextCrop.bottom = clamp(drag.startCrop.bottom - deltaY, 0, MAX_COMBINED_CROP_PERCENT - drag.startCrop.top);
  }

  if (target === "left") {
    nextCrop.left = clamp(drag.startCrop.left + deltaX, 0, MAX_COMBINED_CROP_PERCENT - drag.startCrop.right);
  }

  if (target === "right") {
    nextCrop.right = clamp(drag.startCrop.right - deltaX, 0, MAX_COMBINED_CROP_PERCENT - drag.startCrop.left);
  }

  return clampCrop(nextCrop);
}

function getMovedCrop(pointer: { x: number; y: number }, drag: DragState): OcrCropRatios {
  const deltaX = pointer.x - drag.startPointer.x;
  const deltaY = pointer.y - drag.startPointer.y;
  const cropWidth = 100 - drag.startCrop.left - drag.startCrop.right;
  const cropHeight = 100 - drag.startCrop.top - drag.startCrop.bottom;
  const left = clamp(drag.startCrop.left + deltaX, 0, 100 - cropWidth);
  const top = clamp(drag.startCrop.top + deltaY, 0, 100 - cropHeight);

  return clampCrop({
    left,
    right: 100 - cropWidth - left,
    top,
    bottom: 100 - cropHeight - top,
  });
}

export function OcrCropPreview({ imageSrc, imageAlt, crop, compact = false, onCropChange }: OcrCropPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  function startDrag(target: DragTarget, event: React.PointerEvent<HTMLButtonElement>) {
    const preview = previewRef.current;
    if (!preview) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = getPointerPercent(event, preview);
    setDrag({
      target,
      startPointer: pointer,
      startCrop: crop,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const preview = previewRef.current;
    if (!preview || !drag || !onCropChange) {
      return;
    }

    const pointer = getPointerPercent(event, preview);
    const nextCrop =
      drag.target === "move"
        ? getMovedCrop(pointer, drag)
        : getResizedCrop(drag.target, pointer, drag);
    onCropChange(nextCrop);
  }

  function endDrag() {
    setDrag(null);
  }

  return (
    <div
      ref={previewRef}
      className={compact ? "receipt-preview compact crop-preview" : "receipt-preview crop-preview"}
      onPointerCancel={endDrag}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
    >
      <img src={imageSrc} alt={imageAlt} draggable={false} />
      <div
        className="ocr-crop-frame"
        style={{
          top: `${crop.top}%`,
          right: `${crop.right}%`,
          bottom: `${crop.bottom}%`,
          left: `${crop.left}%`,
        }}
      >
        {onCropChange && (
          <>
            <button
              className="ocr-crop-move-area"
              type="button"
              aria-label="OCR範囲を移動"
              onPointerDown={(event) => startDrag("move", event)}
            />
            {(Object.keys(sideLabels) as Array<keyof OcrCropRatios>).map((side) => (
              <button
                key={side}
                className={`ocr-crop-handle ${side}`}
                type="button"
                aria-label={`OCR範囲の${sideLabels[side]}端を調整`}
                onPointerDown={(event) => startDrag(side, event)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
