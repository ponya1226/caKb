import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, FileImage, Play, RefreshCw, Send, XCircle } from "lucide-react";
import { CopyTextButton } from "./CopyTextButton";
import { DEFAULT_CATEGORY_ID } from "../constants/categories";
import { toDateInputValue } from "../lib/date";
import { formatFileSize } from "../lib/format";
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
import type { OcrProgress, OcrResult, ReceiptCandidate, ReceiptCategorySuggestion, ReceiptDraft } from "../types";

const LARGE_RECEIPT_IMAGE_BYTES = 5 * 1024 * 1024;

type ReceiptSelection = {
  file: File;
  previewUrl: string;
};

type ReceiptCaptureScreenProps = {
  onConfirm: (drafts: ReceiptDraft[]) => void;
  suggestCategoryForShop: (shopName: string) => ReceiptCategorySuggestion | null;
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

export function ReceiptCaptureScreen({
  onConfirm,
  suggestCategoryForShop,
  isGoogleVisionAuthenticated,
  getGoogleVisionIdToken,
}: ReceiptCaptureScreenProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const transferredPreviewUrlsRef = useRef<Set<string>>(new Set());
  const receiptSelectionsRef = useRef<ReceiptSelection[]>([]);
  const batchDraftsRef = useRef<Record<string, ReceiptDraft>>({});
  const [receiptSelections, setReceiptSelections] = useState<ReceiptSelection[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [ocrText, setOcrText] = useState("");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState(toDateInputValue(new Date()));
  const [pickedShopName, setPickedShopName] = useState("");
  const [pickedAmount, setPickedAmount] = useState(0);
  const [pickedCategorySuggestion, setPickedCategorySuggestion] = useState<ReceiptCategorySuggestion | null>(null);
  const [lastOcrBlocks, setLastOcrBlocks] = useState<ReceiptDraft["ocrBlocks"]>(undefined);
  const [batchItems, setBatchItems] = useState<ReceiptBatchItem[]>([]);
  const [batchDrafts, setBatchDrafts] = useState<Record<string, ReceiptDraft>>({});

  const selectedReceipt = receiptSelections[selectedFileIndex] ?? null;
  const selectedFiles = receiptSelections.map((selection) => selection.file);
  const selectedFile = selectedReceipt?.file ?? null;
  const imagePreviewUrl = selectedReceipt?.previewUrl ?? null;
  const totalFileSize = selectedFiles.reduce((total, file) => total + file.size, 0);
  const hasLargeSelectedFile = selectedFiles.some((file) => file.size > LARGE_RECEIPT_IMAGE_BYTES);
  const parseResult = useMemo(
    () => (ocrText ? parseReceiptText(ocrText, lastOcrBlocks) : null),
    [lastOcrBlocks, ocrText],
  );
  const isGoogleVisionAvailable = isReceiptOcrConfigured();
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

    revokeSelectionUrls(receiptSelections);
    transferredPreviewUrlsRef.current = new Set();
    const nextSelections = files.map(createReceiptSelection);

    setReceiptSelections(nextSelections);
    setSelectedFileIndex(0);
    setOcrText("");
    setLastOcrBlocks(undefined);
    setProgress(null);
    setError(null);
    setPickedDate(toDateInputValue(new Date()));
    setPickedShopName("");
    setPickedAmount(0);
    setPickedCategorySuggestion(null);
    batchDraftsRef.current = {};
    setBatchDrafts({});
    setBatchItems(nextSelections.map((selection) => ({
      key: selection.previewUrl,
      fileName: selection.file.name,
      status: "waiting",
    })));
    event.target.value = "";
  }

  function createDraftFromOcr(file: File, imageUrl: string, ocrResult: OcrResult): ReceiptDraft {
    const parsed = parseReceiptText(ocrResult.text, ocrResult.blocks);
    const initialShopName = parsed.shopNameCandidates[0]?.value ?? "";
    const categorySuggestion = suggestCategoryForShop(initialShopName);

    return {
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
  }

  function pickShopName(shopName: string) {
    setPickedShopName(shopName);
    setPickedCategorySuggestion(suggestCategoryForShop(shopName));
  }

  async function resolveGoogleVisionAuthToken(): Promise<string> {
    if (!isGoogleVisionAvailable) {
      throw new Error("レシート読み取りは現在利用できません。手入力で登録してください。");
    }

    const token = await getGoogleVisionIdToken();
    if (!token) {
      throw new Error("レシート読み取りにはGoogleログインが必要です。アカウント画面でログインしてください。");
    }

    return token;
  }

  async function runOcrForSelection(
    selection: ReceiptSelection,
    onProgress: (progress: OcrProgress) => void,
    googleVisionAuthToken: string,
  ): Promise<OcrResult> {
    return runReceiptOcr(selection.file, {
      authToken: googleVisionAuthToken,
      onProgress,
    });
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

    markPreviewUrlsTransferred(
      receiptSelections.filter((selection) => Boolean(draftsByPreviewUrl[selection.previewUrl])),
    );
    onConfirm(drafts);
  }

  async function handleRunOcr(failedOnly = false) {
    if (selectedFiles.length === 0) {
      setError("画像を選択してください");
      return;
    }

    setIsRunning(true);
    setError(null);
    setProgress({ status: "読み取りを準備中", progress: 0 });

    try {
      const googleVisionAuthToken = await resolveGoogleVisionAuthToken();

      if (receiptSelections.length === 1 && selectedReceipt) {
        const ocrResult = await runOcrForSelection(selectedReceipt, setProgress, googleVisionAuthToken);
        const parsed = parseReceiptText(ocrResult.text, ocrResult.blocks);
        const initialShopName = parsed.shopNameCandidates[0]?.value ?? "";
        const categorySuggestion = suggestCategoryForShop(initialShopName);
        setOcrText(ocrResult.text);
        setLastOcrBlocks(ocrResult.blocks);
        setPickedDate(parsed.dateCandidates[0]?.value ?? toDateInputValue(new Date()));
        setPickedShopName(initialShopName);
        setPickedAmount(parsed.amountCandidates[0]?.value ?? 0);
        setPickedCategorySuggestion(categorySuggestion);
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
    onConfirm([{
      imageFile: selectedReceipt.file,
      imagePreviewUrl: selectedReceipt.previewUrl,
      ...(lastOcrBlocks ? { ocrBlocks: lastOcrBlocks } : {}),
      ocrText,
      parseResult,
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
        <button className="button button-primary" type="button" onClick={() => cameraInputRef.current?.click()}>
          <Camera size={19} aria-hidden="true" />
          撮影
        </button>
        <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()}>
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
        <div className="inline-notice">レシートを読み取るには、アカウント画面でGoogleログインしてください。</div>
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
          {receiptSelections.length === 1 && canReadReceipt && (
            <button className="button button-secondary button-compact" type="button" disabled={isRunning} onClick={() => void handleRunOcr()}>
              もう一度試す
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
    </section>
  );
}
