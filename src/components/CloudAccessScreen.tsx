import { useEffect, useState, type ReactNode } from "react";
import { Cloud, CloudOff, LogIn, LogOut, Plus, RefreshCw, UserPlus } from "lucide-react";
import type { CloudHouseholdState } from "../hooks/useCloudHousehold";
import type { FirebaseAuthState } from "../hooks/useFirebaseAuth";
import type { CloudAccessState } from "../lib/cloudAccess";
import type { CloudConnectionState } from "../types";

type CloudAccessScreenProps = {
  state: Exclude<CloudAccessState, "ready">;
  firebaseAuth: FirebaseAuthState;
  cloudHousehold: CloudHouseholdState;
};

type CloudConnectionRequiredScreenProps = {
  connection: CloudConnectionState;
  onRetry: () => void;
  onSignOut: () => Promise<void>;
};

function AccessShell({
  title,
  description,
  offline = false,
  children,
}: {
  title: string;
  description: string;
  offline?: boolean;
  children?: ReactNode;
}) {
  return (
    <main className="app-shell access-shell">
      <section className="cloud-access-panel">
        <div className={offline ? "cloud-access-mark offline" : "cloud-access-mark"}>
          {offline ? <CloudOff size={30} aria-hidden="true" /> : <Cloud size={30} aria-hidden="true" />}
        </div>
        <div className="cloud-access-copy">
          <p className="eyebrow">caKb 家族の家計簿</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {children && <div className="cloud-access-actions">{children}</div>}
      </section>
    </main>
  );
}

export function CloudAccessScreen({ state, firebaseAuth, cloudHousehold }: CloudAccessScreenProps) {
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    if (!householdName && firebaseAuth.user) {
      setHouseholdName(`${firebaseAuth.user.displayName}の家計簿`);
    }
  }, [firebaseAuth.user, householdName]);

  if (state === "offline") {
    return (
      <AccessShell
        offline
        title="インターネット接続が必要です"
        description="caKbは家族のクラウド家計簿へ接続して利用します。通信状態を確認すると自動的に再接続します。"
      >
        <button className="button button-secondary full-width" type="button" onClick={() => window.location.reload()}>
          <RefreshCw size={18} aria-hidden="true" />
          再読み込み
        </button>
      </AccessShell>
    );
  }

  if (state === "configurationMissing") {
    return (
      <AccessShell
        title="アプリを利用できません"
        description="クラウド家計簿の接続設定が見つかりません。管理者へお問い合わせください。"
      />
    );
  }

  if (state === "checkingAuth" || state === "checkingHousehold") {
    return (
      <AccessShell
        title={state === "checkingAuth" ? "ログイン状態を確認中" : "家計簿を確認中"}
        description="クラウドへ安全に接続しています。"
      />
    );
  }

  if (state === "signedOut") {
    return (
      <AccessShell
        title="家計簿をはじめる"
        description="Googleでログインすると、家族と同じ家計簿へ安全に記録できます。"
      >
        <button
          className="button button-primary full-width"
          type="button"
          onClick={() => void firebaseAuth.signInWithGoogle()}
          disabled={firebaseAuth.isWorking}
        >
          <LogIn size={18} aria-hidden="true" />
          {firebaseAuth.isWorking ? "ログイン中" : "Googleでログイン"}
        </button>
        {firebaseAuth.error && (
          <div className="inline-error" role="alert">
            {firebaseAuth.error}
          </div>
        )}
        <p className="cloud-access-note">
          支出は参加した家族のクラウド家計簿に保存します。レシート画像は文字を読み取るためGoogleのサービスへ送信します。
        </p>
      </AccessShell>
    );
  }

  if (state === "householdError") {
    return (
      <AccessShell
        title="家計簿へ接続できません"
        description={cloudHousehold.error ?? "通信状態を確認して、もう一度お試しください。"}
      >
        <button className="button button-primary full-width" type="button" onClick={() => void cloudHousehold.refresh()}>
          <RefreshCw size={18} aria-hidden="true" />
          再試行
        </button>
        <button className="button button-secondary full-width" type="button" onClick={() => void firebaseAuth.signOut()}>
          <LogOut size={18} aria-hidden="true" />
          ログアウト
        </button>
      </AccessShell>
    );
  }

  return (
    <AccessShell
      title="家族の家計簿を設定"
      description="新しく作成するか、家族から受け取った招待コードで参加してください。"
    >
      <div className="cloud-access-form">
        <label className="field">
          <span>新しい家計簿の名前</span>
          <input
            type="text"
            value={householdName}
            placeholder="例: わが家の家計簿"
            onChange={(event) => setHouseholdName(event.target.value)}
          />
        </label>
        <button
          className="button button-primary full-width"
          type="button"
          disabled={cloudHousehold.isWorking || !householdName.trim()}
          onClick={() => void cloudHousehold.createHousehold(householdName)}
        >
          <Plus size={18} aria-hidden="true" />
          家計簿を作成
        </button>
      </div>

      <div className="cloud-access-divider"><span>または</span></div>

      <div className="cloud-access-form">
        <label className="field">
          <span>招待コード</span>
          <input
            type="text"
            value={inviteCode}
            maxLength={10}
            autoCapitalize="characters"
            placeholder="招待コードを入力"
            onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
          />
        </label>
        <button
          className="button button-secondary full-width"
          type="button"
          disabled={cloudHousehold.isWorking || !inviteCode.trim()}
          onClick={() => void cloudHousehold.joinHousehold(inviteCode)}
        >
          <UserPlus size={18} aria-hidden="true" />
          家族の家計簿へ参加
        </button>
      </div>

      {cloudHousehold.error && <div className="inline-error" role="alert">{cloudHousehold.error}</div>}

      <button className="button button-secondary full-width" type="button" onClick={() => void firebaseAuth.signOut()}>
        <LogOut size={18} aria-hidden="true" />
        別のアカウントを使う
      </button>
    </AccessShell>
  );
}

export function CloudConnectionRequiredScreen({
  connection,
  onRetry,
  onSignOut,
}: CloudConnectionRequiredScreenProps) {
  const isDenied = connection.status === "permissionDenied";
  const isOffline = connection.status === "offline";
  const lastSync = connection.lastSuccessfulSyncAt
    ? new Date(connection.lastSuccessfulSyncAt).toLocaleString("ja-JP")
    : null;

  return (
    <AccessShell
      offline={isOffline || isDenied}
      title={isDenied ? "家計簿の利用権限がありません" : isOffline ? "インターネット接続が必要です" : "クラウドへ再接続中"}
      description={isDenied
        ? "家計簿から解除された可能性があります。管理者へ確認するか、別のアカウントでログインしてください。"
        : lastSync
          ? `最後に接続できた日時: ${lastSync}`
          : "接続が完了すると家計簿を利用できます。"}
    >
      {!isDenied && (
        <button className="button button-primary full-width" type="button" onClick={onRetry}>
          <RefreshCw size={18} aria-hidden="true" />
          再接続
        </button>
      )}
      <button className="button button-secondary full-width" type="button" onClick={() => void onSignOut()}>
        <LogOut size={18} aria-hidden="true" />
        ログアウト
      </button>
    </AccessShell>
  );
}
