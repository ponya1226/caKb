import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Copy, FileImage, Play, RefreshCw, Save, Send, SlidersHorizontal, Sparkles, XCircle } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { OcrCropPreview } from "./OcrCropPreview";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { toDateInputValue } from "../lib/date";
import { formatFileSize } from "../lib/format";
import { detectOcrCrop, type OcrCropRatios, type OcrPreprocessMode } from "../lib/ocr";
import { isGoogleVisionProviderConfigured } from "../lib/ocrProviders";
import {
  FULL_OCR_CROP,
  getOcrPresets,
  getPairedCropSide,
  MAX_COMBINED_CROP_PERCENT,
  RECEIPT_BODY_CROP,
  runOcrWithRangeMode,
} from "../lib/ocrRange";
import type { OcrMode, OcrPreset, OcrRunResult } from "../lib/ocrRange";
import { parseReceiptText } from "../lib/receiptParser";
import { createLineItemsFromCandidates } from "../lib/lineItems";
import {
  orderReceiptBatchValues,
  selectReceiptBatchKeys,
  type ReceiptBatchItem,
} from "../lib/receiptBatch";
import type { OcrProgress, OcrProvider, ReceiptCandidate, ReceiptCategorySuggestion, ReceiptDraft } from "../types";

const LARGE_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;

type ReceiptCropStatus = "detecting" | "detected" | "fallback" | "manual" | "preset" | "auto";

type ReceiptSelection = {
  file: File;
  previewUrl: string;
  crop: OcrCropRatios;
  mode: OcrMode;
  presetLabel: string | null;
  preprocess: boolean;
  preprocessMode: OcrPreprocessMode;
  cropStatus: ReceiptCropStatus;
};

type ReceiptCaptureScreenProps = {
  onConfirm: (drafts: ReceiptDraft[]) => void;
  suggestCategoryForShop: (shopName: string) => ReceiptCategorySuggestion | null;
  savedOcrCrop?: OcrCropRatios;
  onSaveOcrCrop: (crop: OcrCropRatios) => void;
  isGoogleVisionAuthenticated: boolean;
  getGoogleVisionIdToken: () => Promise<string | null>;
};

function CandidateButtons<T>({
  title,
  candidates,
  selectedValue,
  onPick,
}: {
  title: string;
  candidates: Array<ReceiptCandidate<T>>;
  selectedValue: T | null | undefined;
  onPick: (value: T) => void;
}) {
  return (
    <div className="candidate-group">
      <h3>{title}</h3>
      {candidates.length === 0 ? (
        <p className="subtle-text">候補なし</p>
      ) : (
        <div className="candidate-list">
          {candidates.map((candidate) => {
            const isSelected = candidate.value === selectedValue;

            return (
              <button
                key={`${candidate.label}-${candidate.line}`}
                className={isSelected ? "candidate-chip active" : "candidate-chip"}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onPick(candidate.value)}
              >
                <span>{candidate.label}</span>
                <small>{candidate.line}</small>
                {isSelected && <small className="candidate-selected-badge">選択中</small>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getInitialOcrProvider(): OcrProvider {
  return isGoogleVisionProviderConfigured() ? "googleVision" : "localTesseract";
}

export function ReceiptCaptureScreen({
  onConfirm,
  suggestCategoryForShop,
  savedOcrCrop,
  onSaveOcrCrop,
  isGoogleVisionAuthenticated,
  getGoogleVisionIdToken,
}: ReceiptCaptureScreenProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const transferredPreviewUrlsRef = useRef<Set<string>>(new Set());
  const transferredOcrImageUrlsRef = useRef<Set<string>>(new Set());
  const receiptSelectionsRef = useRef<ReceiptSelection[]>([]);
  const batchDraftsRef = useRef<Record<string, ReceiptDraft>>({});
  const ocrImagePreviewUrlRef = useRef<string | null>(null);
  const [receiptSelections, setReceiptSelections] = useState<ReceiptSelection[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [ocrImagePreviewUrl, setOcrImagePreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState(toDateInputValue(new Date()));
  const [pickedShopName, setPickedShopName] = useState("");
  const [pickedAmount, setPickedAmount] = useState(0);
  const [pickedCategorySuggestion, setPickedCategorySuggestion] = useState<ReceiptCategorySuggestion | null>(null);
  const [ocrProvider, setOcrProvider] = useState<OcrProvider>(getInitialOcrProvider);
  const [lastOcrProvider, setLastOcrProvider] = useState<OcrProvider>(getInitialOcrProvider);
  const [lastOcrBlocks, setLastOcrBlocks] = useState<ReceiptDraft["ocrBlocks"]>(undefined);
  const [batchItems, setBatchItems] = useState<ReceiptBatchItem[]>([]);
  const [batchDrafts, setBatchDrafts] = useState<Record<string, ReceiptDraft>>({});

  const selectedReceipt = receiptSelections[selectedFileIndex] ?? null;
  const selectedFiles = receiptSelections.map((selection) => selection.file);
  const selectedFile = selectedReceipt?.file ?? null;
  const imagePreviewUrl = selectedReceipt?.previewUrl ?? null;
  const ocrMode = selectedReceipt?.mode ?? "auto";
  const ocrCrop = selectedReceipt?.crop ?? savedOcrCrop ?? RECEIPT_BODY_CROP;
  const selectedPresetLabel = selectedReceipt?.presetLabel ?? null;
  const totalFileSize = selectedFiles.reduce((total, file) => total + file.size, 0);
  const hasLargeSelectedFile = selectedFiles.some((file) => file.size > LARGE_RECEIPT_IMAGE_BYTES);
  const isGoogleVisionSelected = ocrProvider === "googleVision";
  const isDetectingCrop = !isGoogleVisionSelected && receiptSelections.some((selection) => selection.cropStatus === "detecting");
  const parseResult = ocrText ? parseReceiptText(ocrText) : null;
  const ocrPresets = useMemo(() => getOcrPresets(savedOcrCrop), [savedOcrCrop]);
  const isGoogleVisionAvailable = isGoogleVisionProviderConfigured();
  const canUseGoogleVision = isGoogleVisionAvailable && isGoogleVisionAuthenticated;

  useEffect(() => {
    receiptSelectionsRef.current = receiptSelections;
  }, [receiptSelections]);

  useEffect(() => {
    ocrImagePreviewUrlRef.current = ocrImagePreviewUrl;
  }, [ocrImagePreviewUrl]);

  useEffect(() => {
    batchDraftsRef.current = batchDrafts;
  }, [batchDrafts]);

  useEffect(() => {
    if (!canUseGoogleVision && ocrProvider === "googleVision") {
      setOcrProvider("localTesseract");
    }
  }, [canUseGoogleVision, ocrProvider]);

  useEffect(() => {
    return () => {
      revokeSelectionUrls(receiptSelectionsRef.current);
      revokeOcrImagePreviewUrl(ocrImagePreviewUrlRef.current);
      revokeBatchDraftUrls(batchDraftsRef.current);
    };
  }, []);

  function revokeSelectionUrls(selections: ReceiptSelection[]) {
    selections.forEach((selection) => {
      if (!transferredPreviewUrlsRef.current.has(selection.previewUrl)) {
        URL.revokeObjectURL(selection.previewUrl);
      }
    });
  }

  function markPreviewUrlsTransferred(selections: ReceiptSelection[]) {
    selections.forEach((selection) => {
      transferredPreviewUrlsRef.current.add(selection.previewUrl);
    });
  }

  function revokeOcrImagePreviewUrl(url: string | null | undefined) {
    if (url && !transferredOcrImageUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
    }
  }

  function setCurrentOcrImagePreviewUrl(url: string | null | undefined) {
    revokeOcrImagePreviewUrl(ocrImagePreviewUrl);
    setOcrImagePreviewUrl(url ?? null);
  }

  function markOcrImageUrlsTransferred(urls: Array<string | undefined>) {
    urls.forEach((url) => {
      if (url) {
        transferredOcrImageUrlsRef.current.add(url);
      }
    });
  }

  function revokeBatchDraftUrls(drafts: Record<string, ReceiptDraft>) {
    Object.values(drafts).forEach((draft) => revokeOcrImagePreviewUrl(draft.ocrImagePreviewUrl));
  }

  function getProviderDefaultCrop(provider: OcrProvider): OcrCropRatios {
    return provider === "googleVision" ? FULL_OCR_CROP : savedOcrCrop ?? RECEIPT_BODY_CROP;
  }

  function createReceiptSelection(file: File): ReceiptSelection {
    const isGoogleVision = ocrProvider === "googleVision";
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      crop: getProviderDefaultCrop(ocrProvider),
      mode: "manual",
      presetLabel: isGoogleVision ? "全体" : "自動検出中",
      preprocess: !isGoogleVision,
      preprocessMode: "contrast",
      cropStatus: isGoogleVision ? "preset" : "detecting",
    };
  }

  function applyProviderDefaultRange(provider: OcrProvider) {
    setReceiptSelections((currentSelections) =>
      currentSelections.map((selection) => {
        const isGoogleVision = provider === "googleVision";
        return {
          ...selection,
          crop: getProviderDefaultCrop(provider),
          mode: "manual",
          presetLabel: isGoogleVision ? "全体" : "既定補正",
          preprocess: !isGoogleVision,
          preprocessMode: "contrast",
          cropStatus: isGoogleVision ? "preset" : "fallback",
        };
      }),
    );
  }

  function updateReceiptSelection(index: number, updater: (selection: ReceiptSelection) => ReceiptSelection) {
    setReceiptSelections((currentSelections) =>
      currentSelections.map((selection, selectionIndex) => (
        selectionIndex === index ? updater(selection) : selection
      )),
    );
  }

  function updateSelectedReceipt(updater: (selection: ReceiptSelection) => ReceiptSelection) {
    updateReceiptSelection(selectedFileIndex, updater);
  }

  async function detectCropForSelections(selections: ReceiptSelection[]) {
    for (const selection of selections) {
      const detectedCrop = await detectOcrCrop(selection.file).catch(() => null);
      setReceiptSelections((currentSelections) =>
        currentSelections.map((currentSelection) => {
          if (currentSelection.previewUrl !== selection.previewUrl || currentSelection.cropStatus !== "detecting") {
            return currentSelection;
          }

          if (!detectedCrop) {
            return {
              ...currentSelection,
              presetLabel: "既定補正",
              cropStatus: "fallback",
            };
          }

          return {
            ...currentSelection,
            crop: detectedCrop,
            presetLabel: "自動検出補正",
            cropStatus: "detected",
          };
        }),
      );
    }
  }

  function getCropDescription(selection: ReceiptSelection): string {
    if (selection.cropStatus === "detecting") {
      return "画像の用紙範囲を検出しています。";
    }

    if (selection.mode === "auto") {
      return "複数の範囲を試して、候補が最も揃う結果を使います。";
    }

    if (receiptSelections.length > 1) {
      return `画像ごとに読み取る範囲を保持しています。使用範囲: ${selection.presetLabel ?? "手動調整"}`;
    }

    return `使用範囲: ${selection.presetLabel ?? "手動補正"}`;
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    revokeSelectionUrls(receiptSelections);
    revokeOcrImagePreviewUrl(ocrImagePreviewUrl);
    revokeBatchDraftUrls(batchDrafts);
    transferredPreviewUrlsRef.current = new Set();
    transferredOcrImageUrlsRef.current = new Set();
    const nextSelections = files.map(createReceiptSelection);

    setReceiptSelections(nextSelections);
    setSelectedFileIndex(0);
    setOcrText("");
    setOcrImagePreviewUrl(null);
    setLastOcrProvider(ocrProvider);
    setLastOcrBlocks(undefined);
    setProgress(null);
    setError(null);
    setPickedCategorySuggestion(null);
    setBatchDrafts({});
    setBatchItems(nextSelections.map((selection) => ({
      key: selection.previewUrl,
      fileName: selection.file.name,
      status: "waiting",
    })));
    event.target.value = "";
    if (ocrProvider !== "googleVision") {
      void detectCropForSelections(nextSelections);
    }
  }

  function createDraftFromOcr(file: File, imageUrl: string, ocrResult: OcrRunResult): ReceiptDraft {
    const text = ocrResult.text;
    const parsed = parseReceiptText(text);
    const initialShopName = parsed.shopNameCandidates[0]?.value ?? "";
    const categorySuggestion = suggestCategoryForShop(initialShopName);

    return {
      imageFile: file,
      imagePreviewUrl: imageUrl,
      ...(ocrResult.ocrImagePreviewUrl ? { ocrImagePreviewUrl: ocrResult.ocrImagePreviewUrl } : {}),
      ocrProvider: ocrResult.provider,
      ...(ocrResult.blocks ? { ocrBlocks: ocrResult.blocks } : {}),
      ocrText: text,
      parseResult: parsed,
      ocrCrop: ocrResult.crop,
      ocrPresetLabel: ocrResult.presetLabel,
      ocrPreprocess: ocrResult.preprocess,
      ocrPreprocessMode: ocrResult.preprocessMode,
      initialValues: {
        date: parsed.dateCandidates[0]?.value ?? toDateInputValue(new Date()),
        shopName: initialShopName,
        amount: parsed.amountCandidates[0]?.value ?? 0,
        categoryId: categorySuggestion?.categoryId ?? DEFAULT_CATEGORY_ID,
        memo: "",
        lineItems: createLineItemsFromCandidates(parsed.lineItemCandidates),
      },
      ...(categorySuggestion ? { categorySuggestion } : {}),
    };
  }

  function pickShopName(shopName: string) {
    setPickedShopName(shopName);
    setPickedCategorySuggestion(suggestCategoryForShop(shopName));
  }

  function applyManualCrop(nextCrop: OcrCropRatios) {
    updateSelectedReceipt((selection) => ({
      ...selection,
      mode: "manual",
      preprocess: true,
      preprocessMode: "contrast",
      presetLabel: "手動補正",
      crop: nextCrop,
      cropStatus: "manual",
    }));
  }

  function handleCropChange(side: keyof OcrCropRatios, value: number) {
    updateSelectedReceipt((selection) => {
      const pairedSide = getPairedCropSide(side);
      const maxValue = Math.max(0, MAX_COMBINED_CROP_PERCENT - selection.crop[pairedSide]);
      return {
        ...selection,
        mode: "manual",
        preprocess: true,
        preprocessMode: "contrast",
        presetLabel: "手動補正",
        crop: {
          ...selection.crop,
          [side]: Math.min(value, maxValue),
        },
        cropStatus: "manual",
      };
    });
  }

  function applyPreset(preset: OcrPreset) {
    updateSelectedReceipt((selection) => ({
      ...selection,
      mode: "manual",
      presetLabel: preset.label,
      preprocess: Boolean(preset.preprocess),
      preprocessMode: preset.preprocessMode ?? "contrast",
      crop: preset.crop,
      cropStatus: "preset",
    }));
  }

  function applyAutoMode() {
    updateSelectedReceipt((selection) => ({
      ...selection,
      mode: "auto",
      presetLabel: ocrProvider === "googleVision" ? "全体" : null,
      preprocess: false,
      preprocessMode: "contrast",
      crop: getProviderDefaultCrop(ocrProvider),
      cropStatus: "auto",
    }));
  }

  function applySelectedCropToAll() {
    if (!selectedReceipt) {
      return;
    }

    setReceiptSelections((currentSelections) =>
      currentSelections.map((selection) => ({
        ...selection,
        mode: "manual",
        presetLabel: selectedReceipt.presetLabel ?? "共通範囲補正",
        preprocess: true,
        preprocessMode: selectedReceipt.preprocessMode,
        crop: selectedReceipt.crop,
        cropStatus: "manual",
      })),
    );
  }

  async function runOcrForSelection(
    selection: ReceiptSelection,
    onProgress: (progress: OcrProgress) => void,
    provider: OcrProvider,
    googleVisionAuthToken: string | null,
    forceRange = false,
  ): Promise<OcrRunResult> {
    return runOcrWithRangeMode(selection.file, {
      provider,
      mode: forceRange ? "manual" : selection.mode,
      crop: selection.crop,
      presetLabel: forceRange ? selection.presetLabel ?? "選択範囲補正" : selection.presetLabel,
      preprocess: selection.preprocess,
      preprocessMode: selection.preprocessMode,
      savedOcrCrop,
      googleVisionAuthToken,
      onProgress,
    });
  }

  async function resolveGoogleVisionAuthToken(provider: OcrProvider): Promise<string | null> {
    if (provider !== "googleVision") {
      return null;
    }

    const token = await getGoogleVisionIdToken();
    if (!token) {
      throw new Error("オンライン読み取りにはGoogleログインが必要です。設定画面でログインするか、端末内読み取りを利用してください。");
    }

    return token;
  }

  function confirmBatchDrafts(draftsByPreviewUrl: Record<string, ReceiptDraft>) {
    const drafts = orderReceiptBatchValues(
      receiptSelections.map((selection) => selection.previewUrl),
      draftsByPreviewUrl,
    );
    if (drafts.length === 0) {
      setError("確認できる読み取り結果がありません");
      return;
    }

    const successfulSelections = receiptSelections.filter((selection) => Boolean(draftsByPreviewUrl[selection.previewUrl]));
    markPreviewUrlsTransferred(successfulSelections);
    markOcrImageUrlsTransferred(drafts.map((draft) => draft.ocrImagePreviewUrl));
    onConfirm(drafts);
  }

  async function handleRunOcr(providerOverride?: OcrProvider, failedOnly = false) {
    if (selectedFiles.length === 0) {
      setError("画像を選択してください");
      return;
    }

    const activeProvider = providerOverride ?? ocrProvider;
    if (providerOverride && providerOverride !== ocrProvider) {
      setOcrProvider(providerOverride);
    }
    setIsRunning(true);
    setError(null);
    setProgress({ status: "読み取りを準備中", progress: 0 });

    try {
      const googleVisionAuthToken = await resolveGoogleVisionAuthToken(activeProvider);

      if (receiptSelections.length === 1 && selectedReceipt) {
        const ocrResult = await runOcrForSelection(selectedReceipt, setProgress, activeProvider, googleVisionAuthToken);
        const parsed = parseReceiptText(ocrResult.text);
        const initialShopName = parsed.shopNameCandidates[0]?.value ?? "";
        const categorySuggestion = suggestCategoryForShop(initialShopName);
        setOcrText(ocrResult.text);
        setCurrentOcrImagePreviewUrl(ocrResult.ocrImagePreviewUrl);
        setLastOcrProvider(ocrResult.provider);
        setLastOcrBlocks(ocrResult.blocks);
        setPickedDate(parsed.dateCandidates[0]?.value ?? toDateInputValue(new Date()));
        setPickedShopName(initialShopName);
        setPickedAmount(parsed.amountCandidates[0]?.value ?? 0);
        setPickedCategorySuggestion(categorySuggestion);
        updateReceiptSelection(selectedFileIndex, (selection) => ({
          ...selection,
          crop: ocrResult.crop,
          presetLabel: ocrResult.presetLabel,
          preprocess: ocrResult.preprocess,
          preprocessMode: ocrResult.preprocessMode,
          cropStatus: ocrResult.presetLabel === "自動" ? "auto" : selection.cropStatus,
        }));
        if (activeProvider !== "googleVision") {
          onSaveOcrCrop(ocrResult.crop);
        }
        return;
      }

      const targetKeys = selectReceiptBatchKeys(batchItems, failedOnly);
      const targetSelections = receiptSelections.filter((selection) => targetKeys.has(selection.previewUrl));
      if (targetSelections.length === 0) {
        setError("再試行する画像がありません");
        return;
      }

      const nextDrafts = failedOnly ? { ...batchDraftsRef.current } : {};
      if (!failedOnly) {
        revokeBatchDraftUrls(batchDraftsRef.current);
        setBatchDrafts({});
      }
      setBatchItems((currentItems) => currentItems.map((item) => {
        if (!targetSelections.some((selection) => selection.previewUrl === item.key)) {
          return item;
        }
        return {
          key: item.key,
          fileName: item.fileName,
          status: "waiting",
        };
      }));

      let failedCount = 0;
      for (const [index, selection] of targetSelections.entries()) {
        setBatchItems((currentItems) => currentItems.map((item) => (
          item.key === selection.previewUrl
            ? { ...item, status: "processing", error: undefined }
            : item
        )));
        try {
          const ocrResult = await runOcrForSelection(
            selection,
            (nextProgress) => {
              setProgress({
                status: `${index + 1}/${targetSelections.length} ${nextProgress.status}`,
                progress: (index + nextProgress.progress) / targetSelections.length,
              });
            },
            activeProvider,
            googleVisionAuthToken,
            true,
          );
          const previousDraft = nextDrafts[selection.previewUrl];
          if (previousDraft?.ocrImagePreviewUrl && previousDraft.ocrImagePreviewUrl !== ocrResult.ocrImagePreviewUrl) {
            revokeOcrImagePreviewUrl(previousDraft.ocrImagePreviewUrl);
          }
          nextDrafts[selection.previewUrl] = createDraftFromOcr(selection.file, selection.previewUrl, ocrResult);
          setBatchItems((currentItems) => currentItems.map((item) => (
            item.key === selection.previewUrl
              ? { ...item, status: "completed", error: undefined }
              : item
          )));
        } catch (unknownError) {
          failedCount += 1;
          delete nextDrafts[selection.previewUrl];
          const message = unknownError instanceof Error ? unknownError.message : "レシートを読み取れませんでした";
          setBatchItems((currentItems) => currentItems.map((item) => (
            item.key === selection.previewUrl
              ? { ...item, status: "failed", error: message }
              : item
          )));
        }
      }

      batchDraftsRef.current = nextDrafts;
      setBatchDrafts(nextDrafts);
      if (failedCount === 0) {
        confirmBatchDrafts(nextDrafts);
      } else {
        setError(`${failedCount}枚を読み取れませんでした。失敗した画像だけやり直せます。`);
      }
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "レシートを読み取れませんでした");
    } finally {
      setIsRunning(false);
    }
  }

  function handleConfirm() {
    if (!selectedReceipt || !parseResult) {
      return;
    }

    const categorySuggestion = suggestCategoryForShop(pickedShopName) ?? pickedCategorySuggestion;
    markPreviewUrlsTransferred([selectedReceipt]);
    markOcrImageUrlsTransferred([ocrImagePreviewUrl ?? undefined]);
    onConfirm([{
      imageFile: selectedReceipt.file,
      imagePreviewUrl: selectedReceipt.previewUrl,
      ...(ocrImagePreviewUrl ? { ocrImagePreviewUrl } : {}),
      ocrProvider: lastOcrProvider,
      ...(lastOcrBlocks ? { ocrBlocks: lastOcrBlocks } : {}),
      ocrText,
      parseResult,
      ocrCrop: selectedReceipt.crop,
      ocrPresetLabel: selectedReceipt.presetLabel ?? undefined,
      ocrPreprocess: selectedReceipt.preprocess,
      ocrPreprocessMode: selectedReceipt.preprocessMode,
      initialValues: {
        date: pickedDate,
        shopName: pickedShopName,
        amount: pickedAmount,
        categoryId: categorySuggestion?.categoryId ?? DEFAULT_CATEGORY_ID,
        memo: "",
        lineItems: createLineItemsFromCandidates(parseResult.lineItemCandidates),
      },
      ...(categorySuggestion ? { categorySuggestion } : {}),
    }]);
  }

  function getOcrRunButtonLabel(): string {
    if (isDetectingCrop) {
      return "範囲検出中";
    }

    if (isRunning) {
      return "読み取り中";
    }

    if (selectedFiles.length > 1) {
      return isGoogleVisionSelected ? "オンラインでまとめて読み取る" : "端末内でまとめて読み取る";
    }

    return isGoogleVisionSelected ? "オンラインで読み取る" : "端末内で読み取る";
  }

  const failedBatchCount = batchItems.filter((item) => item.status === "failed").length;
  const completedBatchCount = batchItems.filter((item) => item.status === "completed").length;

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">レシート読み取り</p>
          <h1>レシート登録</h1>
        </div>
      </div>

      <input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" aria-label="撮影するレシート画像を選択" onChange={handleFileChange} />
      <input ref={uploadInputRef} className="visually-hidden" type="file" accept="image/*" multiple aria-label="読み取るレシート画像を選択" onChange={handleFileChange} />

      <div className="capture-actions">
        <button className="button button-primary" type="button" onClick={() => cameraInputRef.current?.click()}>
          <Camera size={19} aria-hidden="true" />
          撮影
        </button>
        <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()}>
          <FileImage size={19} aria-hidden="true" />
          アップロード
        </button>
      </div>

      <section className="content-section">
        <div className="section-title-row">
          <h2>読み取り方法</h2>
        </div>
        <div className="provider-selector" role="group" aria-label="レシートの読み取り方法">
          <button
            className={ocrProvider === "googleVision" ? "button button-primary" : "button button-secondary"}
            type="button"
            onClick={() => {
              setOcrProvider("googleVision");
              applyProviderDefaultRange("googleVision");
            }}
            disabled={!canUseGoogleVision}
          >
            オンライン読み取り（推奨）
          </button>
          <button
            className={ocrProvider === "localTesseract" ? "button button-primary" : "button button-secondary"}
            type="button"
            onClick={() => {
              setOcrProvider("localTesseract");
              applyProviderDefaultRange("localTesseract");
            }}
          >
            端末内読み取り
          </button>
        </div>
        {ocrProvider === "googleVision" ? (
          <div className="privacy-note">
            <p>オンライン読み取りでは、レシート画像をGoogleの文字読み取りサービスへ送信します。</p>
            <p>画像は文字の読み取りにだけ使用し、caKbのサーバーには保存しません。</p>
            <p>通信状況により失敗する場合があります。その場合は端末内読み取りまたは手入力を利用してください。</p>
          </div>
        ) : (
          <p className="subtle-text">
            {isGoogleVisionAvailable && !isGoogleVisionAuthenticated
              ? "オンライン読み取りにはGoogleログインが必要です。端末内読み取りはログインなしでも使えます。"
              : isGoogleVisionAvailable
              ? "画像を外部へ送らず、この端末だけで文字を読み取ります。"
              : "オンライン読み取りは現在利用できません。端末内読み取りを利用してください。"}
          </p>
        )}
      </section>

      {receiptSelections.length > 1 && (
        <div className="receipt-selection-strip" aria-label="選択画像">
          {receiptSelections.map((selection, index) => (
            <button
              className={index === selectedFileIndex ? "receipt-selection-chip active" : "receipt-selection-chip"}
              key={selection.previewUrl}
              type="button"
              onClick={() => setSelectedFileIndex(index)}
            >
              <img src={selection.previewUrl} alt={`${index + 1}枚目のレシート`} />
              <span>{index + 1}</span>
            </button>
          ))}
        </div>
      )}

      {imagePreviewUrl && (
        <OcrCropPreview
          imageSrc={imagePreviewUrl}
          imageAlt="選択したレシート"
          crop={ocrCrop}
          onCropChange={isGoogleVisionSelected ? undefined : applyManualCrop}
        />
      )}

      {selectedFile && (
        <details className="ocr-crop-panel">
          <summary>範囲の補助設定</summary>
          <div className="section-title-row">
            <h2>読み取る範囲</h2>
            {!isGoogleVisionSelected && (
              <div className="preset-actions">
                <button className={ocrMode === "auto" ? "button button-primary button-compact" : "button button-secondary button-compact"} type="button" onClick={applyAutoMode}>
                  <Sparkles size={16} aria-hidden="true" />
                  自動
                </button>
                {receiptSelections.length > 1 && (
                  <button className="button button-secondary button-compact" type="button" onClick={applySelectedCropToAll}>
                    <Copy size={16} aria-hidden="true" />
                    全画像に適用
                  </button>
                )}
                {ocrPresets.map((preset) => (
                  <button
                    className={
                      ocrMode === "manual" && selectedPresetLabel === preset.label
                        ? "button button-primary button-compact"
                        : "button button-secondary button-compact"
                    }
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.id === "body" && <SlidersHorizontal size={16} aria-hidden="true" />}
                    {preset.label}
                  </button>
                ))}
                <button className="button button-secondary button-compact" type="button" onClick={() => onSaveOcrCrop(ocrCrop)}>
                  <Save size={16} aria-hidden="true" />
                  既定にする
                </button>
              </div>
            )}
          </div>
          <p className="subtle-text">
            {ocrProvider === "googleVision"
              ? "オンライン読み取りでは写真全体を使用します。範囲調整は端末内読み取り用の補助機能です。"
              : selectedReceipt ? getCropDescription(selectedReceipt) : ""}
          </p>
          {!isGoogleVisionSelected && (
            <div className="crop-control-grid">
              {[
                ["上", "top"],
                ["下", "bottom"],
                ["左", "left"],
                ["右", "right"],
              ].map(([label, side]) => {
                const cropSide = side as keyof OcrCropRatios;
                const maxValue = Math.max(0, MAX_COMBINED_CROP_PERCENT - ocrCrop[getPairedCropSide(cropSide)]);
                return (
                  <label className="range-field" key={side}>
                    <span>
                      {label} {ocrCrop[cropSide]}%
                    </span>
                    <input
                      type="range"
                      min="0"
                      max={maxValue}
                      step="1"
                      value={ocrCrop[cropSide]}
                      onChange={(event) => handleCropChange(cropSide, Number(event.target.value))}
                    />
                  </label>
                );
              })}
            </div>
          )}
        </details>
      )}

      {selectedFile && (
        <div className={hasLargeSelectedFile ? "file-size-panel warning" : "file-size-panel"}>
          <div>
            <strong>{selectedFiles.length === 1 ? selectedFile.name : `${selectedFiles.length}枚選択`}</strong>
            <span>{formatFileSize(totalFileSize)}</span>
          </div>
          <p>{selectedFiles.length === 1 ? "選択画像の容量を確認しています。" : "複数画像を順番に読み取ります。"}</p>
          {hasLargeSelectedFile && (
            <p>画像が大きいため、読み取りに時間がかかる可能性があります。</p>
          )}
        </div>
      )}

      <div className="button-row">
        <button className="button button-primary" type="button" onClick={() => void handleRunOcr()} disabled={!selectedFile || isRunning || isDetectingCrop || (isGoogleVisionSelected && !canUseGoogleVision)}>
          <Play size={18} aria-hidden="true" />
          {getOcrRunButtonLabel()}
        </button>
      </div>

      {progress && (
        <div className="progress-box">
          <div className="progress-track">
            <span style={{ width: `${Math.max(4, Math.round(progress.progress * 100))}%` }} />
          </div>
          <small>{progress.status}</small>
        </div>
      )}

      {receiptSelections.length > 1 && batchItems.some((item) => item.status !== "waiting") && (
        <section className="batch-status-panel" aria-label="まとめて読み取る処理の状況">
          <div className="section-title-row">
            <h2>まとめて読み取る状況</h2>
            <span>{completedBatchCount}/{batchItems.length}件成功</span>
          </div>
          <div className="batch-status-list">
            {batchItems.map((item, index) => (
              <div className={`batch-status-item ${item.status}`} key={item.key}>
                {item.status === "completed" ? (
                  <CheckCircle2 size={18} aria-hidden="true" />
                ) : item.status === "failed" ? (
                  <XCircle size={18} aria-hidden="true" />
                ) : (
                  <RefreshCw size={18} aria-hidden="true" />
                )}
                <div>
                  <strong>{index + 1}. {item.fileName}</strong>
                  <span>
                    {item.status === "completed"
                      ? "確認待ち"
                      : item.status === "failed"
                        ? item.error ?? "読み取れませんでした"
                        : item.status === "processing"
                          ? "読み取り中"
                          : "待機中"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {failedBatchCount > 0 && (
            <div className="button-row">
              <button className="button button-primary" type="button" disabled={isRunning} onClick={() => void handleRunOcr(undefined, true)}>
                <RefreshCw size={18} aria-hidden="true" />
                失敗分だけ再試行
              </button>
              {completedBatchCount > 0 && (
                <button className="button button-secondary" type="button" disabled={isRunning} onClick={() => confirmBatchDrafts(batchDrafts)}>
                  成功分を確認
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="inline-error">
          <p>{error}</p>
          {ocrProvider === "googleVision" && (
            <button className="button button-secondary button-compact" type="button" onClick={() => void handleRunOcr("localTesseract", failedBatchCount > 0)}>
              端末内読み取りでやり直す
            </button>
          )}
        </div>
      )}

      {parseResult && (
        <div className="candidate-panel">
          <CandidateButtons title="日付候補" candidates={parseResult.dateCandidates} selectedValue={pickedDate} onPick={setPickedDate} />
          <CandidateButtons title="店舗名候補" candidates={parseResult.shopNameCandidates} selectedValue={pickedShopName} onPick={pickShopName} />
          <CandidateButtons title="金額候補" candidates={parseResult.amountCandidates} selectedValue={pickedAmount} onPick={setPickedAmount} />
          <div className="picked-summary">
            <span>{pickedDate}</span>
            <span>{pickedShopName || "店舗名未選択"}</span>
            <strong>¥{pickedAmount.toLocaleString("ja-JP")}</strong>
          </div>
          <button className="button button-primary full-width" type="button" onClick={handleConfirm}>
            <Send size={18} aria-hidden="true" />
            確認へ
          </button>
        </div>
      )}

      {ocrText && (
        <section className="content-section">
          <div className="section-title-row">
            <h2>読み取った文字</h2>
            <CopyTextButton text={ocrText} label="全文コピー" />
          </div>
          <pre className="ocr-text">{ocrText}</pre>
        </section>
      )}

      {ocrImagePreviewUrl && (
        <details className="content-section ocr-debug-panel">
          <summary>読み取りに使用した画像を確認</summary>
          <img src={ocrImagePreviewUrl} alt="読み取り用に見やすくした画像" />
        </details>
      )}
    </section>
  );
}
