import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, FileImage, Play, RefreshCw, XCircle } from "lucide-react";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { toDateInputValue } from "../lib/date";
import { formatFileSize } from "../lib/format";
import { assessReceiptConfidence } from "../lib/receiptConfidence";
import {
  isReceiptOcrConfigured,
  runReceiptOcr,
} from "../lib/receiptOcr";
import { parseReceiptText } from "../lib/receiptParser";
import { createLineItemsFromCandidates } from "../lib/lineItems";
import {
  orderReceiptBatchValues,
  selectReceiptBatchKeys,
  type ReceiptBatchItem,
} from "../lib/receiptBatch";
import type { Expense, OcrProgress, OcrResult, ReceiptCategorySuggestion, ReceiptDraft, ReceiptReviewCause } from "../types";

const LARGE_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;

type ReceiptSelection = {
  file: File;
  previewUrl: string;
};

type ReceiptCaptureScreenProps = {
  onConfirm: (drafts: ReceiptDraft[], cause: ReceiptReviewCause) => Promise<void>;
  onAutoSave: (draft: ReceiptDraft) => Promise<Expense>;
  onAutoSaveComplete: (expense: Expense, draft: ReceiptDraft) => void;
  suggestCategoryForShop: (shopName: string) => ReceiptCategorySuggestion | null;
  isGoogleVisionAuthenticated: boolean;
  getGoogleVisionIdToken: () => Promise<string | null>;
  initialFiles?: File[];
  onInitialFilesConsumed?: () => void;
  ocrRunner?: typeof runReceiptOcr;
  isOcrAvailable?: boolean;
};

export function ReceiptCaptureScreen({
  onConfirm,
  onAutoSave,
  onAutoSaveComplete,
  suggestCategoryForShop,
  isGoogleVisionAuthenticated,
  getGoogleVisionIdToken,
  initialFiles,
  onInitialFilesConsumed,
  ocrRunner = runReceiptOcr,
  isOcrAvailable,
}: ReceiptCaptureScreenProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const transferredPreviewUrlsRef = useRef<Set<string>>(new Set());
  const receiptSelectionsRef = useRef<ReceiptSelection[]>([]);
  const batchDraftsRef = useRef<Record<string, ReceiptDraft>>({});
  const consumedInitialFilesRef = useRef<File[] | null>(null);
  const [receiptSelections, setReceiptSelections] = useState<ReceiptSelection[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchItems, setBatchItems] = useState<ReceiptBatchItem[]>([]);
  const [batchDrafts, setBatchDrafts] = useState<Record<string, ReceiptDraft>>({});

  const selectedReceipt = receiptSelections[selectedFileIndex] ?? null;
  const selectedFiles = receiptSelections.map((selection) => selection.file);
  const selectedFile = selectedReceipt?.file ?? null;
  const imagePreviewUrl = selectedReceipt?.previewUrl ?? null;
  const totalFileSize = selectedFiles.reduce((total, file) => total + file.size, 0);
  const hasLargeSelectedFile = selectedFiles.some((file) => file.size > LARGE_RECEIPT_IMAGE_BYTES);
  const isGoogleVisionAvailable = isOcrAvailable ?? isReceiptOcrConfigured();
  const canReadReceipt = isGoogleVisionAvailable && isGoogleVisionAuthenticated;
  const failedBatchCount = batchItems.filter((item) => item.status === "failed").length;
  const completedBatchCount = batchItems.filter((item) => item.status === "completed").length;

  useEffect(() => {
    receiptSelectionsRef.current = receiptSelections;
  }, [receiptSelections]);

  useEffect(() => {
    batchDraftsRef.current = batchDrafts;
  }, [batchDrafts]);

  useEffect(() => {
    return () => revokeSelectionUrls(receiptSelectionsRef.current);
  }, []);

  useEffect(() => {
    if (!initialFiles || initialFiles.length === 0 || consumedInitialFilesRef.current === initialFiles) {
      return;
    }

    consumedInitialFilesRef.current = initialFiles;
    handleSelectedFiles(initialFiles);
    onInitialFilesConsumed?.();
  }, [initialFiles]);

  function revokeSelectionUrls(selections: ReceiptSelection[]) {
    selections.forEach((selection) => {
      if (!transferredPreviewUrlsRef.current.has(selection.previewUrl)) {
        URL.revokeObjectURL(selection.previewUrl);
      }
    });
  }

  function markPreviewUrlsTransferred(selections: ReceiptSelection[]) {
    selections.forEach((selection) => transferredPreviewUrlsRef.current.add(selection.previewUrl));
  }

  function createReceiptSelection(file: File): ReceiptSelection {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
    };
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    handleSelectedFiles(files);
    event.target.value = "";
  }

  function handleSelectedFiles(files: File[]) {
    revokeSelectionUrls(receiptSelections);
    transferredPreviewUrlsRef.current = new Set();
    const nextSelections = files.map(createReceiptSelection);

    setReceiptSelections(nextSelections);
    setSelectedFileIndex(0);
    setProgress(null);
    setError(null);
    batchDraftsRef.current = {};
    setBatchDrafts({});
    setBatchItems(nextSelections.map((selection) => ({
      key: selection.previewUrl,
      fileName: selection.file.name,
      status: "waiting",
    })));

    if (nextSelections.length === 1 && canReadReceipt) {
      void processSingleSelection(nextSelections[0]);
    }
  }

  function createDraftFromOcr(file: File, imageUrl: string, ocrResult: OcrResult): ReceiptDraft {
    const parsed = parseReceiptText(ocrResult.text, ocrResult.blocks);
    const initialShopName = parsed.shopNameCandidates[0]?.value ?? "";
    const categorySuggestion = suggestCategoryForShop(initialShopName);

    const draft: ReceiptDraft = {
      imageFile: file,
      imagePreviewUrl: imageUrl,
      ...(ocrResult.blocks ? { ocrBlocks: ocrResult.blocks } : {}),
      ocrText: ocrResult.text,
      parseResult: parsed,
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

    return {
      ...draft,
      confidenceAssessment: assessReceiptConfidence({
        ocrText: draft.ocrText,
        parseResult: draft.parseResult,
        categorySuggestion: draft.categorySuggestion,
      }),
    };
  }

  async function resolveGoogleVisionAuthToken(): Promise<string> {
    if (!isGoogleVisionAvailable) {
      throw new Error("レシート読み取りは現在利用できません。手入力で登録してください。");
    }

    const token = await getGoogleVisionIdToken();
    if (!token) {
      throw new Error("レシート読み取りにはログインと家計簿への参加が必要です。アカウント画面を確認してください。");
    }

    return token;
  }

  async function runOcrForSelection(
    selection: ReceiptSelection,
    onProgress: (progress: OcrProgress) => void,
    googleVisionAuthToken: string,
  ): Promise<OcrResult> {
    return ocrRunner(selection.file, {
      authToken: googleVisionAuthToken,
      onProgress,
    });
  }

  async function processSingleSelection(selection: ReceiptSelection) {
    setIsRunning(true);
    setError(null);
    setProgress({ status: "読み取りを準備中", progress: 0 });

    try {
      const googleVisionAuthToken = await resolveGoogleVisionAuthToken();
      const ocrResult = await runOcrForSelection(selection, setProgress, googleVisionAuthToken);
      const draft = createDraftFromOcr(selection.file, selection.previewUrl, ocrResult);

      if (draft.confidenceAssessment?.decision === "autoSave") {
        const expense = await onAutoSave(draft);
        revokeSelectionUrls([selection]);
        setReceiptSelections([]);
        setBatchItems([]);
        setProgress(null);
        onAutoSaveComplete(expense, draft);
        return;
      }

      markPreviewUrlsTransferred([selection]);
      await onConfirm([draft], "confidence");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "レシートを読み取れませんでした");
    } finally {
      setIsRunning(false);
    }
  }

  async function confirmBatchDrafts(draftsByPreviewUrl: Record<string, ReceiptDraft>) {
    const drafts = orderReceiptBatchValues(
      receiptSelections.map((selection) => selection.previewUrl),
      draftsByPreviewUrl,
    );
    if (drafts.length === 0) {
      setError("確認できる読み取り結果がありません");
      return;
    }

    markPreviewUrlsTransferred(
      receiptSelections.filter((selection) => Boolean(draftsByPreviewUrl[selection.previewUrl])),
    );
    await onConfirm(drafts, "batch");
  }

  async function handleRunOcr(failedOnly = false) {
    if (selectedFiles.length === 0) {
      setError("画像を選択してください");
      return;
    }

    if (receiptSelections.length === 1 && selectedReceipt) {
      await processSingleSelection(selectedReceipt);
      return;
    }

    setIsRunning(true);
    setError(null);
    setProgress({ status: "読み取りを準備中", progress: 0 });

    try {
      const googleVisionAuthToken = await resolveGoogleVisionAuthToken();

      const targetKeys = selectReceiptBatchKeys(batchItems, failedOnly);
      const targetSelections = receiptSelections.filter((selection) => targetKeys.has(selection.previewUrl));
      if (targetSelections.length === 0) {
        setError("再試行する画像がありません");
        return;
      }

      const nextDrafts = failedOnly ? { ...batchDraftsRef.current } : {};
      if (!failedOnly) {
        setBatchDrafts({});
      }
      setBatchItems((currentItems) => currentItems.map((item) => (
        targetSelections.some((selection) => selection.previewUrl === item.key)
          ? { key: item.key, fileName: item.fileName, status: "waiting" }
          : item
      )));

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
            googleVisionAuthToken,
          );
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
        await confirmBatchDrafts(nextDrafts);
      } else {
        setError(`${failedCount}枚を読み取れませんでした。失敗した画像だけやり直せます。`);
      }
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "レシートを読み取れませんでした");
    } finally {
      setIsRunning(false);
    }
  }

  function getOcrRunButtonLabel(): string {
    if (isRunning) {
      return "読み取り中";
    }

    return selectedFiles.length > 1 ? `${selectedFiles.length}枚をまとめて読み取る` : "レシートを読み取る";
  }

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
        <button className="button button-primary" type="button" disabled={isRunning} onClick={() => cameraInputRef.current?.click()}>
          <Camera size={19} aria-hidden="true" />
          撮影
        </button>
        <button className="button button-secondary" type="button" disabled={isRunning} onClick={() => uploadInputRef.current?.click()}>
          <FileImage size={19} aria-hidden="true" />
          アップロード
        </button>
      </div>

      <div className="privacy-note">
        <strong>オンラインでレシートを読み取ります</strong>
        <span>画像はGoogleの文字読み取りサービスへ送信し、caKbのサーバーには保存しません。</span>
      </div>

      {!isGoogleVisionAvailable ? (
        <div className="inline-error">レシート読み取りは現在利用できません。手入力で登録してください。</div>
      ) : !isGoogleVisionAuthenticated ? (
        <div className="inline-notice">レシートを読み取るには、アカウント画面でログインして家計簿へ参加してください。</div>
      ) : null}

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
        <div className="receipt-preview">
          <img src={imagePreviewUrl} alt="選択したレシート" />
        </div>
      )}

      {selectedFile && (
        <div className={hasLargeSelectedFile ? "file-size-panel warning" : "file-size-panel"}>
          <div>
            <strong>{selectedFiles.length === 1 ? selectedFile.name : `${selectedFiles.length}枚選択`}</strong>
            <span>{formatFileSize(totalFileSize)}</span>
          </div>
          {hasLargeSelectedFile && <p>画像が大きいため、読み取りに時間がかかる可能性があります。</p>}
        </div>
      )}

      <div className="button-row">
        <button className="button button-primary" type="button" onClick={() => void handleRunOcr()} disabled={!selectedFile || isRunning || !canReadReceipt}>
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
            <h2>読み取り状況</h2>
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
              <button className="button button-primary" type="button" disabled={isRunning} onClick={() => void handleRunOcr(true)}>
                <RefreshCw size={18} aria-hidden="true" />
                失敗分だけ再試行
              </button>
              {completedBatchCount > 0 && (
                <button className="button button-secondary" type="button" disabled={isRunning} onClick={() => void confirmBatchDrafts(batchDrafts)}>
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
          {receiptSelections.length === 1 && canReadReceipt && (
            <button className="button button-secondary button-compact" type="button" disabled={isRunning} onClick={() => void handleRunOcr()}>
              もう一度試す
            </button>
          )}
        </div>
      )}

    </section>
  );
}
