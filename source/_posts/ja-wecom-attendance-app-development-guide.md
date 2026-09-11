---
title: "企業微信アプリ開発完全ガイド：既存の勤怠＋Activiti承認システムをH5で連携する実践"
date: 2026-07-09 21:00:00
tags:
  - 企業微信
  - H5開発
  - 勤怠システム
  - Activiti
  - ワークフロー
  - シングルサインオン
  - API連携
categories:
  - 技術実践
lang: ja
---

多くのチームにとって企業微信（WeCom）の開発は、ゼロから新しいシステムを作るのではなく、次のような、より一般的で現実的な場面に向き合うものです。**業務システムはすでに存在し、長年稼働している**——勤怠モジュールはとうにリリース済みで、承認フローは Activiti 上に会签（全員承認）、或签（いずれか1名が承認）、組織構造に基づく段階的承認といった複雑なプロセスを実装済み、承認プロセスから勤怠データを参照したり連携したりもしている。いまの要望は、このシステムを企業微信に持ち込み、従業員がWeComワークベンチでタップするだけで使えるようにし、**ユーザー名とパスワードを再入力することなく、入室すれば自分の勤怠データと承認待ちタスクが表示される**ことです。

この前提では、H5アプリ方式はミニプログラムよりも適した選択になることが多いです。既存システム自体が Angular + SpringBoot の Web 構成であり、H5ならフロントエンドのページとバックエンドのAPIをそのまま再利用でき、企業微信 OAuth2 ウェブ認可（`snsapi_base`）と組み合わせることで完全にサイレントな自動ログイン（免登）を実現できます。デプロイすれば即座に有効になり審査・リリースが不要なため、承認フォームを頻繁に調整する場合のイテレーションコストが最小で済みます。

本記事では「**既存の勤怠管理システム＋Activitiの複雑な承認フロー**」を背景に、**H5方式を主线**として、業務システムを書き直さずに企業微信側の連携を完成させる方法を体系的に解説します。重点は、OAuth2 サイレント自動ログインの完全な連鎖、企業微信アカウントとシステムアカウントの紐付けマッピング、JS-SDK デバイス機能の呼び出し、そして Activiti の会签／或签／組織構造承認と勤怠連携をWeCom側で実現する方法（承認待ちプッシュ、カードからのワンクリック承認、組織構造同期）です。

<!-- more -->

## 1. シナリオ分析と方式の選定

### 1.1 既存システムの前提

本記事では、業務システムの現状が次のとおりであると仮定します（これは大半の中堅・大規模企業の社内システムに典型的な形でもあります）。

- **勤怠管理**：打刻、打刻記録、打刻補正（補カード）申請、勤怠集計の機能がすでに揃っており、バックエンドは REST API を提供
- **承認フローエンジン**：Activiti（6.x/7.x）ベースで実装され、プロセス定義に以下を含む
  - **会签（全員承認）**：1つのノードで複数人全員の承認が必要（例：打刻補正に直属上司とHRの双方の同意が必要）
  - **或签（いずれか1名が承認）**：1つのノードで複数人のうち任意の1名が承認すればよい（例：部門の当番承認グループ）
  - **組織構造に基づく承認**：申請者の所属部門に応じて承認者が動的に決まる（部門責任者 → 管掌役員 → HRBP）
  - **勤怠データ連携**：承認フロー内で勤怠データを読み取り／書き戻しする（例：打刻補正承認後に打刻記録を自動修正、年次休暇承認後に残日数を減算）
- **アカウント体系**：システム独自のユーザーテーブル、ロール・権限体系を持つ（例：Spring Security + JWT/Session）
- **フロントエンド**：Web版がすでにあり、Angular シングルページアプリケーション（TypeScript）

解決すべき中核的な課題は2つだけです。

1. **本人確認の課題**：企業微信から入ってきた人が誰か。システムアカウントとどう対応付け、自動ログインを実現するか
2. **入口とリーチの課題**：WeComワークベンチからどうアプリに入るか。承認待ちをどう従業員のWeComへ能動的にプッシュするか

業務ロジック（打刻ルール、承認の遷移）は**1行たりとも企業微信に移す必要はありません**。WeComが担うのは「入口＋アイデンティティプロバイダ（IdP）＋メッセージチャネル」という3つの役割だけです。

### 1.2 このシナリオでH5を第一選択とする理由

| 比較軸 | H5アプリ（本記事の方式） | 企業微信ミニプログラム |
|----------|--------------------|----------------|
| 既存Webフロントの再利用 | 既存Angularページをそのまま再利用 | 全ページをWXML/WXSSで書き直し必要 |
| 既存バックエンドAPIの再利用 | そのまま再利用、OAuthログインエンドポイントを1つ追加するだけ | 同様に再利用できるがフロントは全面作り直し |
| 自動ログイン | OAuth2 `snsapi_base` サイレント認可で完全に無感覚 | `wx.qyLogin` サイレントで、こちらも無感覚 |
| リリース・イテレーション | デプロイ即有効、承認フォームをいつでも変更可能 | 審査提出・リリースが必要で、緊急修正が遅い |
| 複雑なフォーム／フロー画面 | Web技術で柔軟、承認のような重いフォーム画面に適する | フォームエンジン系画面の開発コストが高い |
| デバイス機能 | JS-SDK：位置情報／撮影／QRスキャン（署名が必要） | ネイティブAPIを直接呼び出し、体験はやや良好 |
| 承認フローのような「低頻度・重フォーム・高頻度イテレーション」業務 | 非常に適合する | やや重い |

**結論**：勤怠打刻そのものは頻度が高くデバイス機能に強く依存するため、ミニプログラムの体験が確かに優れています。しかし「**既存システムの連携、承認フローが複雑で頻繁に調整される、最優先目標が低コストでのリリースと自動ログイン**」という前提では、H5の総合的なメリットは体験面のわずかな差をはるかに上回ります。しかもH5でも JS-SDK を通じて位置情報、撮影、QRスキャンを起動でき、勤怠シナリオを完全にカバーできます。本記事の後半では、JS-SDK の完全な署名方式と iOS／Android でのハマりどころへの対処を示します。

> 後で打刻体験のさらなる向上が求められる場合は、ハイブリッド方式も可能です。同一の自建アプリ（自社製アプリ）にH5ホームページ（承認、記録、集計）とミニプログラム（打刻）の両方を設定し、メッセージカードを業務タイプ別にそれぞれへ遷移させ、バックエンドのアカウント体系は完全に共有します。

### 1.3 全体アーキテクチャ

```
┌───────────────────────────────┐
│          企業微信クライアント      │
│  ワークベンチ / メッセージカード / スキャン │
└───────────────┬───────────────┘
                │ H5を開く（内蔵WebView）
                ▼
┌───────────────────────────────┐
│   H5フロント（既存Webプロジェクトを再利用）  │
│  Angular SPA + wx JS-SDK     │
│  ルートガード：tokenなし → OAuthへ │
└───────────────┬───────────────┘
                │ HTTPS（JWT）
                ▼
┌───────────────────────────────────────────────────────┐
│                    既存業務バックエンド（SpringBoot）     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ WecomOAuth   │  │ 勤怠モジュール │  │ Activiti承認  │ │
│  │ 免登/アカウント紐付け │  │(既存、再利用) │  │(既存、再利用) │ │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘ │
│         │          アカウント・マッピング表 user_id ↔ wecom_userid │
└─────────┼────────────────────────────────────┼─────────┘
          ▼                                    ▼
┌───────────────────┐              ┌──────────────────────┐
│ 企業微信サーバーAPI  │              │ PostgreSQL / Redis   │
│ gettoken           │              │ 業務テーブル + act_* ワークフローテーブル│
│ auth/getuserinfo   │              └──────────────────────┘
│ jsapi_ticket       │
│ message/send プッシュ │◀──── 承認待ちタスク発生時、バックエンドが能動的にカードをプッシュ
└───────────────────┘
```

重要な設計原則：**企業微信 userid は、システムのユーザーテーブル上の1つの外部IDフィールドにすぎない**。勤怠や Activiti の候補者／処理者には、引き続きシステム内部の userId を使用します（userid と統一する方法については 4.6 節で議論）。こうすることで企業微信は新たに追加されたログイン手段の1つにすぎず、既存の権限やワークフローモデルに侵入しません。

> 上図ではH5フロント、WeComアダプタロジック、業務バックエンドを同じ側に描いていますが、これは呼び出し関係を示すためです。勤怠システムが社内ネットワーク分離ゾーンに配置され、企業微信や外部網のスマホから直接アクセスできない場合は、DMZ に公開中継ゲートウェイを別途デプロイする必要があります（WeComアダプタロジックはゲートウェイに置き、業務は社内に残し、両者間は mTLS＋内部トークンで管理された相互通信を行う）。詳細は**第9章「ネットワーク分離下の公開中継ゲートウェイ」**を参照してください。

## 2. 開発環境の構築

### 2.1 自建アプリの作成と3要素の取得

1. [企業微信管理コンソール](https://work.weixin.qq.com/) にアクセスし、管理者アカウントでログイン
2. 「応用管理」→「自建（自社製）」→「アプリ作成」で、アプリ名（例「モバイル勤怠承認」）、ロゴ、可視範囲を入力
3. 作成後、3つの重要なパラメータを記録します。

| パラメータ | 説明 | 取得場所 |
|------|------|----------|
| `corpid` | 企業の一意識別子 | マイ企業 → 企業情報 → 企業ID |
| `agentid` | アプリの一意識別子 | 応用管理 → 自建アプリ → AgentId |
| `secret` | アプリのシークレット鍵 | 応用管理 → 自建アプリ → Secret |

> ⚠️ `secret` は最高機密の認証情報であり、**サーバー側にのみ保存**し、H5フロントのコード、Gitリポジトリ、ブラウザのリクエストには絶対に含めないでください。

### 2.2 アプリホームページ（H5入口）の設定

アプリ詳細ページの「アプリホームページ」でH5のトップページURLを設定します。

```
応用管理 → 自建アプリ → アプリホームページ → ウェブページ設定
  ホームページURL：https://attendance.yourcompany.com/mobile/
```

従業員がWeComワークベンチでアプリアイコンをタップすると、企業微信内蔵ブラウザでこのURLが開かれます。H5モバイル版には独立したパス（例 `/mobile/`）を使用し、PC管理画面と区別して、ルーティング分流と独立レイアウトを行いやすくすることを推奨します。

### 2.3 信頼ドメインの設定（H5で最も重要な管理コンソール設定）

H5方式では、OAuth ウェブ認可のコールバックドメインと JS-SDK の両方が「信頼ドメイン」に依存します。

```
応用管理 → 自建アプリ → 開発者インターフェース → ウェブ認可およびJS-SDK
  → 信頼ドメインを設定：attendance.yourcompany.com
  → ドメイン帰属検証ファイルをダウンロード（WW_verify_xxxx.txt）
  → ファイルをドメインのルートディレクトリに配置し、アクセス可能にする：
    https://attendance.yourcompany.com/WW_verify_xxxx.txt
```

ドメインの要件：

- 必須 **HTTPS**（OAuth認可とJS-SDKで強制）
- ICP 届出（备案）が完了していること（中国大陸のサーバー）
- ドメイン帰属検証ファイルはフロントの静的リソースサービスまたは Nginx が直接ホスティング
- 1アプリに複数の信頼ドメインを設定可能（ドメイン主体は一致が必要）。コールバックURLはこれらのドメイン配下でなければならない

あわせて「企業信頼IP」も設定します。サーバーAPIを呼び出すサーバーの出口IPをホワイトリストに追加しないと、`gettoken` などのインターフェースが `60020 not allow to access from your ip` を返します。

### 2.4 メッセージ受信の設定（コールバック、カードボタン承認用）

「メッセージカード上で直接 承認／却下 をタップする」（ページを開かない）操作を実現するには、コールバックの設定が必要です。

```
応用管理 → 自建アプリ → メッセージ受信 → API受信を設定
  URL:             https://attendance.yourcompany.com/api/wecom/callback/message
  Token:           任意に設定（署名検証に使用）
  EncodingAESKey:  ランダム生成（メッセージ本文のAES暗号化／復号に使用）
```

承認待ちからの遷移だけでカード内インタラクションを行わないなら設定しなくても構いませんが、最初から設定しておくことを推奨します（第7章で使用します）。

### 2.5 ローカル開発環境

H5ローカル開発の中核的な難所は、OAuth コールバックと JS-SDK が信頼ドメイン＋HTTPS を要求するのに対し、ローカルは `http://localhost` であることです。一般的な方式は2つあります。

**方式1：内部ネットワーク貫通（推奨、実環境に最も近い）**

```bash
# frp または ngrok を使い、ローカルの8080/フロントのポートを届出済みドメインのサブパスにマッピング
# 例：https://dev-attendance.yourcompany.com をマッピング
frpc -c frpc.ini

# Angular dev server がホスト名ドメインからのアクセスを許可（angular.json）
# serve オプション：host を 0.0.0.0 に、デフォルトポート4200
# angular.json -> projects/<name>.architect.serve.options
{ "host": "0.0.0.0", "port": 4200 }
# またはコマンドライン：ng serve --host 0.0.0.0 --port 4200
```

貫通ドメインを管理コンソールの信頼ドメインに追加し（開発段階）、検証ファイルをローカルの静的ディレクトリに置けば検証を通過できます。

**方式2：hosts + mkcert（公開網不要、純粋なページ連携調整に適する）**

```bash
mkcert -install
mkcert attendance.yourcompany.com        # ローカルで信頼される証明書を生成
# /etc/hosts
127.0.0.1 attendance.yourcompany.com
```

> 注意：hosts 方式はブラウザの証明書検証をごまかせるだけで、企業微信クライアントのOAuth認可は実際の企業微信サーバーを経由してリダイレクトで戻るため、実機デバッグ時にスマホはあなたのPCのhostsを使えません。したがって**実機デバッグには内部ネットワーク貫通ドメインが必須**です。

**バックエンドのローカル起動**：

```bash
cd ~/work/code/attendance-backend
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

## 3. H5フロントプロジェクトの組み込み

### 3.1 ディレクトリ構成（既存Angularプロジェクトを再利用し、モバイルモジュールを追加）

新規プロジェクトを作る必要はありません。既存の Angular + TypeScript プロジェクトに、モバイル用の遅延ロードモジュール（feature module / routes）とWeComアダプタ層を追加するだけです。

```
attendance-web/
├── src/
│   ├── main.ts
│   ├── index.html                   # ここで <script> により jweixin を読み込むことも可
│   ├── app/
│   │   ├── app.routes.ts            # ルーティング総入口（PC/モバイル分流）
│   │   ├── mobile/                  # WeCom内H5モバイル版（遅延ロードモジュール）
│   │   │   ├── mobile.routes.ts     # モバイル用サブルート
│   │   │   ├── guards/
│   │   │   │   └── wecom-auth.guard.ts   # 免登ルートガード（CanActivate）
│   │   │   └── pages/
│   │   │       ├── checkin/checkin.component.ts      # 打刻ホーム
│   │   │       ├── records/records.component.ts      # 打刻記録
│   │   │       ├── todo/todo-list.component.ts       # 承認待ち（Activiti tasks）
│   │   │       ├── todo/approval-detail.component.ts # 承認詳細（会签/或签の進捗）
│   │   │       ├── apply/makeup-apply.component.ts   # 打刻補正申請（フローを起動）
│   │   │       └── oauth/oauth-callback.component.ts # OAuthコールバック着地点ページ
│   │   ├── core/
│   │   │   ├── interceptors/
│   │   │   │   └── auth.interceptor.ts   # HttpClientインターセプタ（JWT注入、401で再ログイン）
│   │   │   └── services/            # 既存業務Serviceを再利用
│   │   │       ├── checkin.service.ts
│   │   │       └── approval.service.ts
│   │   └── wecom/                   # WeComアダプタ層（今回追加する中核）
│   │       ├── env.service.ts       # WeCom環境かどうか、UA判定
│   │       ├── oauth.service.ts     # OAuth2免登遷移ロジック
│   │       ├── jssdk.service.ts     # wx.config / agentConfig / 署名
│   │       └── device.service.ts    # 位置情報、撮影、スキャンのラッパー
├── public/ （または src/）
│   └── WW_verify_xxxx.txt           # ドメイン帰属検証ファイル（静的リソースのルートに配置）
└── angular.json
```

### 3.2 企業微信 JS-SDK の導入

企業微信H5では `jweixin` モジュールを使用します（WeChat公式アカウントの JSSDK と同系統であり、企業微信はその上に `wx.agentConfig` と企業専用インターフェースを拡張しています）。

```bash
npm install weixin-js-sdk --save
# または index.html で直接読み込み
# <script src="https://res.wx.qq.com/open/js/jweixin-1.2.0.js"></script>
```

```typescript
// src/app/wecom/env.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WecomEnvService {
  /** 現在企業微信クライアント内で動作しているか */
  isInWecom(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    // 企業微信のUAには wxwork と micromessenger の両方が含まれる
    return /wxwork/.test(ua) && /micromessenger/.test(ua);
  }

  /** iOSかどうか（JS-SDK署名URLの扱いに差異あり、第5章参照） */
  isIOS(): boolean {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  }
}
```

### 3.3 ルーティングと免登ガード

モバイル版のすべての業務ルートを同一の `CanActivate` ガード配下に置きます。システム token がなければ OAuth 免登を開始し、ログイン成功後に元のページへ戻ります。これが「アプリをタップすると自動ログイン」を実現するマスタースイッチであり、第4章で詳しく展開します。

```typescript
// src/app/mobile/mobile.routes.ts
import { Routes } from '@angular/router';
import { WecomAuthGuard } from './guards/wecom-auth.guard';

export const MOBILE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'checkin' },
  {
    path: 'checkin',
    canActivate: [WecomAuthGuard],
    loadComponent: () => import('./pages/checkin/checkin.component').then(m => m.CheckinComponent),
  },
  {
    path: 'records',
    canActivate: [WecomAuthGuard],
    loadComponent: () => import('./pages/records/records.component').then(m => m.RecordsComponent),
  },
  {
    path: 'todo',
    canActivate: [WecomAuthGuard],
    loadComponent: () => import('./pages/todo/todo-list.component').then(m => m.TodoListComponent),
  },
  {
    path: 'approval/:taskId',
    canActivate: [WecomAuthGuard],
    loadComponent: () =>
      import('./pages/todo/approval-detail.component').then(m => m.ApprovalDetailComponent),
  },
  {
    path: 'apply/makeup',
    canActivate: [WecomAuthGuard],
    loadComponent: () =>
      import('./pages/apply/makeup-apply.component').then(m => m.MakeupApplyComponent),
  },
  // OAuthコールバック着地点ページ：ガードは付けない
  {
    path: 'oauth/callback',
    loadComponent: () =>
      import('./pages/oauth/oauth-callback.component').then(m => m.OauthCallbackComponent),
  },
];
```

```typescript
// src/app/mobile/guards/wecom-auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { WecomOAuthService } from '../../wecom/oauth.service';

export const WecomAuthGuard: CanActivateFn = (route, state) => {
  const oauth = inject(WecomOAuthService);

  // 中核：ログイン済みを保証する。未ログイン時は redirectToWecomAuth 内でOAuthへのフルページ遷移を発生させる
  if (oauth.hasToken()) {
    return true;
  }
  oauth.redirectToWecomAuth(state.url);   // 現在のページを離れる
  return new Promise<boolean>(() => false); // 今回のナビゲーションを停止し、フルページ遷移を待つ
};
```

ルートルーティングでは `mobile` パス配下にモバイル版モジュール全体を遅延ロードします。

```typescript
// src/app/app.routes.ts
export const APP_ROUTES: Routes = [
  {
    path: 'mobile',
    loadChildren: () => import('./mobile/mobile.routes').then(m => m.MOBILE_ROUTES),
  },
  // ...PC管理画面のルート
];
```
## 4. OAuth2 サイレント自動ログイン（免登）の完全な連鎖

これが連携全体の中核です。目標とする効果：従業員がWeCom内でアプリアイコン（または承認メッセージカード）をタップすると、ページが開く過程に**ログインページも確認ボタンも一切なく**、1〜2秒後に直接業務ページへ着地し、しかもバックエンドはすでに「彼がシステム内の誰か」を把握している状態です。

### 4.1 認可方式の選定：snsapi_base

企業微信のウェブ認可は2種類の scope をサポートしています。

| scope | 確認ポップアップの有無 | 取得できるもの | 用途 |
|-------|-----------|-----------|------|
| `snsapi_base` | **サイレント、ポップアップなし** | メンバー userid のみ（バックエンドが交換） | 社内アプリの自動ログイン、**本記事で採用** |
| `snsapi_privateinfo` | ユーザーの手動確認が必要 | userid＋機密情報（携帯番号／メール等、メンバーの認可が必要） | 追加でプライバシー項目を取得する必要があるごく少数のシナリオ |

社内自建アプリで、アプリの可視範囲が利用者をカバーしている場合、`snsapi_base` はWeComクライアント内で完全にサイレントです——これこそ自動ログインの基盤です。この段階で携帯番号やメールを取得する必要はなく（それらはサーバー側の連絡先 API で userid から照会すればよい）、すべて `snsapi_base` を使用します。

### 4.2 全体シーケンス

```
WeComクライアント    H5フロント(WebView)      業務バックエンド          WeComサーバー
    │                   │                     │                     │
    │ アプリホームを開く  │                     │                     │
    │──────────────────▶│                     │                     │
    │                   │ ルートガード：tokenなし│                     │
    │                   │ 302で認可URLへ遷移    │                     │
    │◀──────────────────│                     │                     │
    │ サイレント認可(無感覚)│                   │                     │
    │───────────────────────────────────────▶│                     │
    │ 302でcallback?code=xxx&state=yyyにリダイレクトで戻る           │
    │──────────────────▶│                     │                     │
    │                   │ POST /auth/wecom/login {code}             │
    │                   │────────────────────▶│                     │
    │                   │                     │ gettoken            │
    │                   │                     │────────────────────▶│
    │                   │                     │◀────────────────────│
    │                   │                     │ auth/getuserinfo    │
    │                   │                     │  (code→userid)      │
    │                   │                     │────────────────────▶│
    │                   │                     │◀────────────────────│
    │                   │                     │ userid→システムアカウント検索/作成 │
    │                   │                     │ JWT発行             │
    │                   │◀────────────────────│                     │
    │                   │ token保存、目標ページへ │                     │
    │                   │ 以降のリクエストにJWT付与│                   │
```

2つの重要点に注意してください。

1. **code の交換はバックエンドでのみ行う**：フロントエンドは決してWeCom API を直接呼び出しません（secret が露出する）。フロントが担うのは「遷移の誘導」と「リダイレクトで戻ったURL上の code をバックエンドに渡す」ことだけです。
2. **認可URLはフロントで組み立ててもバックエンドで組み立ててもどちらでもよい**ですが、`state` による CSRF 対策と「ログイン後に元のページへリダイレクトで戻る」ロジックは自前で管理しなければなりません。

### 4.3 ステップ1：認可URLを構築して遷移

認可URLの形式：

```
https://open.weixin.qq.com/connect/oauth2/authorize
  ?appid=CORPID
  &redirect_uri=URL_ENCODED_CALLBACK
  &response_type=code
  &scope=snsapi_base
  &agentid=AGENTID
  &state=STATE
#wechat_redirect
```

| パラメータ | 説明 |
|------|------|
| `appid` | 企業の corpid（ここは appid という名前ですが、入力するのは corpid） |
| `redirect_uri` | 認可後にリダイレクトで戻るアドレス。URL Encode が必要で、信頼ドメイン配下でなければならない |
| `response_type` | 固定 `code` |
| `scope` | `snsapi_base` |
| `agentid` | 自建アプリの agentid（**必須**。ないと一部バージョンで当該アプリのIDを取得できない） |
| `state` | 任意パラメータ。WeComがそのまま持ち帰る。CSRF対策＋リダイレクト先パスの搬送に使用 |
| `#wechat_redirect` | 固定の接尾辞。hash 形式で終わる必要がある |

フロントには注入可能な `WecomOAuthService`（`src/app/wecom/oauth.service.ts`）としてカプセル化します。

```typescript
import { Injectable, inject } from '@angular/core';
import { WecomEnvService } from './env.service';

@Injectable({ providedIn: 'root' })
export class WecomOAuthService {
  private readonly env = inject(WecomEnvService);

  private readonly CORP_ID = 'ww your_corpid';        // corpid は高機密情報ではないのでフロントに置ける
  private readonly AGENT_ID = '1000002';              // agentid も同様に公開可能
  private readonly CALLBACK =
    'https://attendance.yourcompany.com/mobile/oauth/callback';

  hasToken(): boolean {
    return !!localStorage.getItem('sys_token');
  }

  /** ランダムな state を生成し、同時に「ログイン後に移動するページ」を sessionStorage に一時保存 */
  private buildState(redirectPath: string): string {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(`wx_state_${nonce}`, redirectPath || '/mobile/checkin');
    sessionStorage.setItem('wx_state_nonce', nonce);   // コールバック時に検証
    return nonce;
  }

  /** 免登を開始：企業微信の認可URLへフルページ遷移する */
  redirectToWecomAuth(redirectPath: string): void {
    if (!this.env.isInWecom()) {
      // WeCom環境以外（PCブラウザで直接開いた場合等）はシステムのID/パスワード・ログインページへ
      window.location.href = '/login?redirect=' + encodeURIComponent(redirectPath);
      return;
    }
    const state = this.buildState(redirectPath);
    const url =
      'https://open.weixin.qq.com/connect/oauth2/authorize' +
      `?appid=${encodeURIComponent(this.CORP_ID)}` +
      `&redirect_uri=${encodeURIComponent(this.CALLBACK)}` +
      '&response_type=code' +
      '&scope=snsapi_base' +
      `&agentid=${this.AGENT_ID}` +
      `&state=${encodeURIComponent(state)}` +
      '#wechat_redirect';
    window.location.replace(url);
  }
}
```

ルートガードは `hasToken()` を呼んで判定し、未ログインなら `redirectToWecomAuth()` を呼ぶだけです（3.3 の `WecomAuthGuard` 参照）。

> corpid、agentid は「公開識別子」です（認可URLはそもそもブラウザ内に平文で現れるものです）。フロントに置いても問題ありません。本当の鍵は secret だけであり、それは常にサーバー側にのみ存在します。

### 4.4 ステップ2：コールバック着地ページで code を token に交換する

`/mobile/oauth/callback?code=xxx&state=yyy` にリダイレクトで戻った後、コールバックページは3つの処理を行います。state を検証 → code をバックエンドへ送信 → JWT を取得したら元の目標ページへ遷移。

```typescript
// src/app/mobile/pages/oauth/oauth-callback.component.ts
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  template: `<div class="oauth-loading">{{ errMsg() }}</div>`,
})
export default class OauthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);

  protected errMsg = signal('ログイン中...');

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.queryParamMap.get('code') ?? '';
    const state = this.route.snapshot.queryParamMap.get('state') ?? '';

    if (!code) { this.errMsg.set('認可に失敗しました：code がありません'); return; }

    // 1. state を検証し CSRF を防止：遷移前に保存した nonce と一致する必要がある
    const savedNonce = sessionStorage.getItem('wx_state_nonce');
    if (!state || state !== savedNonce) {
      this.errMsg.set('ログイン状態の検証に失敗しました。アプリに入り直してください');
      return;
    }
    const redirectPath = sessionStorage.getItem(`wx_state_${state}`) || '/mobile/checkin';

    try {
      // 2. code をバックエンドに渡してシステムJWTと交換
      const { token } = await firstValueFrom(this.auth.loginByWecomCode(code));
      localStorage.setItem('sys_token', token);
      sessionStorage.removeItem(`wx_state_${state}`);
      sessionStorage.removeItem('wx_state_nonce');
      // 3. 本来行きたかったページへ戻る（ある承認待ちの詳細画面の場合もある）
      this.router.navigateByUrl(redirectPath, { replaceUrl: true });
    } catch (e: any) {
      this.errMsg.set('自動ログインに失敗しました：' + (e?.message || '再試行してください'));
    }
  }
}
```

```typescript
// src/app/core/services/auth.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

interface WecomLoginResp { token: string; userInfo: unknown; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  /** code を JWT に交換：token が不要な数少ないインターフェース（インターセプタで通過させる） */
  loginByWecomCode(code: string): Observable<WecomLoginResp> {
    return this.http
      .post<{ code: number; message: string; data: WecomLoginResp }>(
        '/api/auth/wecom/login', { code })
      // バックエンド統一レスポンス封筒 { code, message, data } をほどく（エラーコード処理はインターセプタで一元化可）
      .pipe(map((resp) => resp.data));
  }
}
```

### 4.5 ステップ3：バックエンドが code を userid に交換する（本人認証の中核）

バックエンドは code を受け取ると、まず access_token を取得し、続いて2つのインターフェースを呼び出します。

- `auth/getuserinfo`：code → userid（社内メンバー）または openid（社外メンバー／外部連絡先）
- userid を取得した後、必要なら `user/get`（連絡先）で氏名、部門、携帯番号を補完する

**インターフェース1：アクセス認証情報の取得**

```
GET https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=CORPID&corpsecret=SECRET
```

`access_token` が返ります（有効期間7200秒）。access_token は集中管理が必須です（Redis キャッシュ＋分散ロック、第8章参照）。フロントや他のサービスが個別に取得することはしません。

**インターフェース2：code を userid に交換**

```
GET https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=TOKEN&code=CODE
```

社内メンバーの場合の返却：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "userid": "zhangsan",
  "user_ticket": "xxx"
}
```

> `userid` がなく `openid` が返ってきた場合、現在の利用者はその企業アプリの可視範囲にいない（外部連絡先の可能性がある）ことを意味します。自動的にアカウントを作るのではなく、ログインを拒否し、管理者に連絡して権限を有効化してもらうよう促すべきです。

**ログイン Controller**：

```java
/**
 * 企業微信 H5 免登
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/api/auth/wecom")
@Slf4j
public class WecomAuthController {

    @Resource
    private WecomAuthService wecomAuthService;

    /**
     * H5 OAuth サイレントログイン：code を userid に交換し、システムアカウント紐付け後に JWT を発行
     */
    @PostMapping("/login")
    public Result<WecomLoginVO> login(@RequestBody @Valid WecomLoginDTO dto) {
        log.info("企業微信 H5 免登、code={}", dto.getCode());
        WecomLoginVO vo = wecomAuthService.loginByCode(dto.getCode());
        return Result.success(vo);
    }
}
```

```java
/**
 * 企業微信免登 Service
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class WecomAuthService {

    @Resource
    private WecomTokenManager tokenManager;
    @Resource
    private RestTemplate restTemplate;
    @Resource
    private SysUserService userService;
    @Resource
    private JwtTokenProvider jwtTokenProvider;

    public WecomLoginVO loginByCode(String code) {
        // 1. code を userid に交換
        String accessToken = tokenManager.getAccessToken();
        String url = String.format(
                "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=%s&code=%s",
                accessToken, code);

        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_AUTH_FAILED,
                    "企業微信の本人情報取得に失敗しました：" + (resp == null ? "null" : resp.getString("errmsg")));
        }

        String wecomUserId = resp.getString("userid");
        if (StrUtil.isBlank(wecomUserId)) {
            // openid のみ：社内メンバーではなく、アプリの可視範囲外
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE,
                    "現在のアカウントはアプリの認可範囲にありません。管理者に連絡してください");
        }

        // 2. userid をシステムアカウントにマッピング（重要、4.6参照）
        SysUser user = userService.getOrBindByWecomUserId(wecomUserId);
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "アカウントは無効化されています");
        }

        // 3. システム独自のJWTを発行し、既存の認証体系を再利用
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return WecomLoginVO.builder()
                .token(jwt)
                .userInfo(UserInfoVO.of(user))
                .build();
    }
}
```

### 4.6 ステップ4：企業微信アカウントとシステムアカウントの紐付け（既存システムで最も重要な設計）

これが「既存業務システム」と「ゼロから作るシステム」の最大の違いです。システムにはすでに多数のアカウントがあり（社員番号、メール、ドメインアカウントでログインしている可能性がある）、WeComから入ってくるのは userid が1つだけです。**「userid で新規ユーザーを作る」だけではいけません**。さもないと同一人物が2つのアカウントになり、勤怠記録も Activiti の承認待ちもすべて突き合わなくなります。

推奨する3つの紐付け方針から、企業の実情に合わせて選択してください。

**方針A：社員番号／アカウントが一致、自動紐付け（最推奨、運用ゼロ）**

企業微信の連絡先にある「アカウント」項目は通常、企業統一の社員番号であり、WeCom userid も社員番号になっていることが多いです。userid = システム username（または社員番号）と取り決め、ログイン時にアカウントで直接関連付けます。

```java
/**
 * 企業微信 userid でシステムアカウントを紐付け
 * 取り決め：WeCom userid とシステム社員番号(username)が一致
 */
public SysUser getOrBindByWecomUserId(String wecomUserId) {
    // 1. まず紐付け済みの wecom_user_id で検索
    SysUser user = userMapper.findByWecomUserId(wecomUserId);
    if (user != null) {
        return user;
    }

    // 2. 未紐付け：社員番号(username)で既存アカウントとの自動マッチを試みる
    user = userMapper.findByUsername(wecomUserId);
    if (user != null) {
        // 紐付け関係を構築し、次回は直接ヒット
        user.setWecomUserId(wecomUserId);
        userMapper.updateById(user);
        log.info("システムアカウント {} を企業微信 userid {} に自動紐付け", user.getUsername(), wecomUserId);
        return user;
    }

    // 3. それでも一致しない：サイレントにアカウント作成しない。紐付け誘導が必要な状態を返し、管理者またはセルフ紐付けフローで処理
    throw new BusinessException(ErrorCode.WECOM_ACCOUNT_NOT_BOUND,
            "企業微信アカウントに関連付くシステムアカウントが見つかりません。管理者に連絡して紐付けてください");
}
```

**方針B：セルフ紐付け（アカウント体系が統一されていない場合）**

初回ログイン時に自動マッチできない場合、ユーザーにシステムアカウントとパスワードを1回入力してもらって紐付けを完了します。その後、その wecom_user_id と user_id のマッピングがDBに保存され、永続的に免登されます。

```
初回WeComログイン → バックエンドがマッピングなしを検出 → NEED_BIND状態を返す
  → H5が紐付けページを表示（システムアカウント/パスワード、または社員番号＋SMS認証コードを入力）
  → バックエンド検証通過 → sys_user.wecom_user_id に書き込み → JWT発行
```

紐付け関係は1回だけ構築され、認証情報は検証後に破棄し、平文パスワードは保存しません。

**方針C：管理者による事前紐付け／連絡先同期**

連絡先 API（`user/list`）で部門単位に一括同期し、WeCom userid とシステムアカウントを社員番号で突き合わせます（同期方式は第8章で示します）。リリース前の一括初期化に適します。

**ユーザーテーブルの改造**（既存ユーザーテーブルにフィールドを追加、既存構造は変更しない）：

```sql
ALTER TABLE sys_user ADD COLUMN wecom_user_id VARCHAR(64);
COMMENT ON COLUMN sys_user.wecom_user_id IS '企業微信 userid（外部ID）';
CREATE UNIQUE INDEX uk_sys_user_wecom ON sys_user (wecom_user_id) WHERE wecom_user_id IS NOT NULL;
```

> 設計のポイント：**内部 userId は変更しない**。勤怠記録の外部キー、Activiti の `ACT_RU_TASK.ASSIGNEE_`、候補者グループはすべて引き続きシステム内部 userId（username）を使用します。WeCom userid は「ログイン時に本人を認識する」ことと「プッシュ時の宛先指定」にのみ使い、`sys_user.wecom_user_id` というマッピング層でデカップリングします。これによりワークフロー定義を汚さず、PCのID/パスワードや他の SSO といったログイン方式との併存も維持できます。

### 4.7 ステップ5：JWT と既存認証体系のシームレスな接続

免登で userid を取得した後のリクエストは PC 版とまったく同じく、システム既存の JWT／Session 認証を通します。これにより勤怠・承認インターフェースは改造ゼロです。

フロントでは Angular の `HttpInterceptor` で token を一元注入し、401 時に再免登します。

```typescript
// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn, HttpHandlerFn, HttpRequest, HttpErrorResponse }
  from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { WecomEnvService } from '../../wecom/env.service';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>, next: HttpHandlerFn,
) => {
  const token = localStorage.getItem('sys_token');
  let authed = req;
  if (token) {
    authed = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(authed).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // token期限切れ：WeCom内なら再サイレント免登（無感覚）、外部環境ならログインページへ
        localStorage.removeItem('sys_token');
        const env = inject(WecomEnvService);
        if (env.isInWecom()) {
          location.reload();   // ルートガードが自動で再度OAuthを開始
        } else {
          location.href = '/login?redirect=' + encodeURIComponent(location.pathname);
        }
      }
      return throwError(() => error);
    }),
  );
};
```

`app.config.ts` に登録します（関数型インターセプタ、Angular 15+）：

```typescript
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { APP_ROUTES } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
```

> 免登インターフェース `/api/auth/wecom/login` 自体には token が付かないため、インターセプタは「ローカルストレージに token がない」場合をそのまま通過させればよく、特別な判定は不要です。再免登がトリガーされるのは 401 時だけです。

バックエンドは既存の Spring Security 設定（SecurityFilterChain Bean 形式）を流用し、WeComログイン端点とコールバック端点だけを通過させます。

```java
/**
 * Spring Security セキュリティ設定
 *
 * @author cuckoom
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                        "/api/auth/wecom/**",      // WeCom免登
                        "/api/wecom/callback/**"   // WeComコールバック
                ).permitAll()
                .anyRequest().authenticated()
            )
            // 前後端分離＋JWT：ステートレス、CSRF無効、JWTフィルタがトークンを解析
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .addFilterBefore(jwtAuthenticationFilter(),
                    UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
    // JwtAuthenticationFilter：Authorizationヘッダを解析しSecurityContextに書き込む。既存実装を流用
}
```

> プロジェクトがまだ Spring Security 5.x の `WebSecurityConfigurerAdapter` を使っている場合、同等の書き方は `configure(HttpSecurity)` をオーバーライドし、同じ2つのパスに `permitAll()`、`csrf().disable()` とすることです。免登で発行された JWT は既存の JWT フィルタが一元検証し、ID/パスワード・ログインと完全に共有されます。

これで「アプリをタップ → 自動ログイン → 自分の勤怠と承認待ちが直接見える」連鎖が完全につながりました。しかも**勤怠と Activiti の既存インターフェース、権限、データは1行も変更していません**。
## 5. JS-SDK：H5で位置情報、撮影、スキャンを使う

勤怠シナリオには位置情報、撮影、スキャンが欠かせません。H5はミニプログラムのようにネイティブAPIを直接呼び出せないため、企業微信 JS-SDK を通じ、署名認可を経て呼び出す必要があります。この章ではすぐに実装できる署名方式を示し、最もハマりやすい iOS／Android の署名URLの差異を重点的に扱います。

### 5.1 wx.config と wx.agentConfig

企業微信 JS-SDK には2層の設定があり、初心者が最も混同しやすい点です。

| 設定 | 用途 | 署名チケット |
|------|------|----------|
| `wx.config` | 基本設定を注入し、汎用機能（共有、位置情報 `getLocation`、スキャン `scanQRCode`、画像選択など大半のインターフェース）を起動 | `jsapi_ticket` で署名 |
| `wx.agentConfig` | 現在の**自建アプリ**のIDを注入し、企業微信専用インターフェース（`selectEnterpriseContact` の人選び、一部の承認関連インターフェース等）を起動 | `get_jsapi_ticket`（企業アプリチケット）で署名 |

勤怠打刻の位置情報／撮影／スキャンは `wx.config` が通れば十分です。「組織構造に基づく承認者／CC宛先人選び」のような企業専用機能でだけ、さらに `agentConfig` が必要になります。

### 5.2 バックエンド：jsapi_ticket 管理と署名

`jsapi_ticket` は access_token と交換し、有効期間は7200秒です。こちらも集中キャッシュが必要です。

```
GET https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=TOKEN
```

企業アプリの agentConfig に使うチケットのインターフェースは `ticket/get?type=agent_config` です。

署名アルゴリズム（企業微信の規定）：

```
string1 = jsapi_ticket={ticket}&noncestr={nonce}&timestamp={timestamp}&url={現在のページURL}
signature = SHA1(string1)
```

```java
/**
 * JS-SDK 署名 Service
 *
 * @author cuckoom
 */
@Service
public class WecomJsapiService {

    @Resource
    private WecomTokenManager tokenManager;
    @Resource
    private RestTemplate restTemplate;
    @Resource
    private StringRedisTemplate redisTemplate;

    private static final String JSAPI_TICKET_KEY = "wecom:jsapi_ticket";

    /** jsapi_ticket を取得（キャッシュ。ロジックは access_token と同じ。分散ロックは省略、8.1参照） */
    public String getJsapiTicket() {
        String cached = redisTemplate.opsForValue().get(JSAPI_TICKET_KEY);
        if (StrUtil.isNotBlank(cached)) {
            return cached;
        }
        String token = tokenManager.getAccessToken();
        String url = "https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket?access_token=" + token;
        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "jsapi_ticket の取得に失敗しました");
        }
        String ticket = resp.getString("ticket");
        redisTemplate.opsForValue().set(JSAPI_TICKET_KEY, ticket, 7100, TimeUnit.SECONDS);
        return ticket;
    }

    /**
     * wx.config に必要な署名を生成
     * @param pageUrl フロントから送られる、署名に使用するページURL（iOSの特殊処理については5.3参照）
     */
    public WxConfigSignatureVO buildConfigSignature(String pageUrl) {
        String ticket = getJsapiTicket();
        String nonceStr = IdUtil.fastSimpleUUID();
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000);

        // 注意：署名に参加する url はフロントの location.href と完全一致する必要がある（hashの扱いは後述）
        String raw = String.format(
                "jsapi_ticket=%s&noncestr=%s&timestamp=%s&url=%s",
                ticket, nonceStr, timestamp, pageUrl);
        String signature = SecureUtil.sha1(raw);

        return WxConfigSignatureVO.builder()
                .corpId(tokenManager.getCorpId())
                .agentId(tokenManager.getAgentId())
                .nonceStr(nonceStr)
                .timestamp(timestamp)
                .signature(signature)
                .build();
    }
}
```

```java
@RestController
@RequestMapping("/api/wecom/jssdk")
public class WecomJsdkController {

    @Resource
    private WecomJsapiService jsapiService;

    /** フロントがページに入った後、現在のURLで署名を取得 */
    @GetMapping("/config")
    public Result<WxConfigSignatureVO> config(@RequestParam("url") String url) {
        return Result.success(jsapiService.buildConfigSignature(url));
    }
}
```

### 5.3 フロント：署名初期化（iOS入口ページ問題を重点対応）

JS-SDK で最も古典的な落とし穴：**Android は現在のページURLで署名するのに対し、iOS（WKWebView）はアプリに初めて入ったときの入口ページURLで署名する**。SPA ではフロントのルーティング切替で実際にページがリフレッシュされないため、iOS で「現在のルートの href」で署名すると、着地した最初のページでない限り `wx.config` は必ず `invalid signature` を返します。

統一的な解決法：**入口ページで最初のURLを記録し、以降の署名はすべてそれを使う（iOS）。Android は常に現在のURLを使う。**

```typescript
// src/app/wecom/jssdk.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, map } from 'rxjs';
import wx from 'weixin-js-sdk';
import { WecomEnvService } from './env.service';

interface WxConfigSignature {
  corpId: string; agentId: string; nonceStr: string;
  timestamp: string; signature: string;
}

@Injectable({ providedIn: 'root' })
export class WecomJssdkService {
  private http = inject(HttpClient);
  private env = inject(WecomEnvService);
  private configPromise: Promise<void> | null = null;

  /** 署名に参加するURLを取得：#hash部分を除去（企業微信の署名規則では url に hash を含めない） */
  private signableUrl(href: string): string {
    const idx = href.indexOf('#');
    return idx >= 0 ? href.slice(0, idx) : href;
  }

  /** 入口ページURLを記録（iOSのみ必要。アプリ起動直後、ルーティング遷移より前に1回呼ぶ） */
  private entryUrl(): string {
    const key = 'wx_ios_entry_url';
    if (this.env.isIOS()) {
      let url = sessionStorage.getItem(key);
      if (!url) {
        url = this.signableUrl(location.href);
        sessionStorage.setItem(key, url);
      }
      return url;
    }
    return this.signableUrl(location.href);   // Android は現在のページ
  }

  /** wx.config の完了を保証（全体で1回だけ、SPA内で再利用可） */
  ensureWxConfig(): Promise<void> {
    if (this.configPromise) return this.configPromise;

    this.configPromise = (async () => {
      const url = this.entryUrl();
      const cfg = await firstValueFrom(
        this.http.get<{ code: number; data: WxConfigSignature }>(
          '/api/wecom/jssdk/config', { params: { url } },
        ).pipe(map((r) => r.data)),
      );

      await new Promise<void>((resolve, reject) => {
        wx.config({
          beta: true,                 // 必須！企業微信専用インターフェースには beta:true が必要
          debug: false,
          appId: cfg.corpId,
          agentId: cfg.agentId,
          timeStamp: cfg.timestamp,
          nonceStr: cfg.nonceStr,
          signature: cfg.signature,
          jsApiList: ['getLocation', 'chooseImage', 'scanQRCode'],
        });
        wx.ready(() => resolve());
        wx.error((res: any) => reject(new Error('wx.config 失敗: ' + res.errMsg)));
      });
    })();

    return this.configPromise;
  }
}
```

アプリ起動時（最初のルーティング遷移より前）に早めに iOS 入口URLを記録します。`APP_INITIALIZER` が使えます。

```typescript
// src/app/app.config.ts に起動初期化を登録
import { APP_INITIALIZER } from '@angular/core';

function recordWxEntryUrl() {
  const jssdk = inject(WecomJssdkService);
  const env = inject(WecomEnvService);
  return () => {
    // ensureWxConfig の入口記録ロジックを1回呼ぶ（iOSは初回遷移前に着地ページURLを固定化）
    if (env.isInWecom()) {
      // wx.config をウォームアップ。ブロックしなくてもよく、実際に位置情報/スキャンを呼ぶときservice内部がフォールバックする
      jssdk.ensureWxConfig().catch(() => void 0);
    }
  };
}

// providers に追加：
// { provide: APP_INITIALIZER, useFactory: recordWxEntryUrl, multi: true }
```

> ポイントは、iOS の入口URLをフロントのルーティング遷移が一切発生する前に `location.href` から読み取って固定することです。`APP_INITIALIZER`（Angular のルーティング起動前に実行）に置くのが最も確実です。署名のウォームアップをしない場合でも、少なくともこのフックで入口URLを sessionStorage に書き込んでください。

> ルーティング方式の推奨：hash と署名の認知負荷を減らすため、H5モバイル版は **history モード**を使えます。hash モードを使う場合は、上記 `signableUrl` で必ず `#` の位置で截断し、前後端が署名に参加するURLを完全一致させ、かつ両方とも `encodeURIComponent` を使う、または両方ともエンコードしない、で統一してください。

### 5.4 位置情報による打刻

```typescript
// src/app/wecom/device.service.ts
import { Injectable, inject } from '@angular/core';
import wx from 'weixin-js-sdk';
import { WecomJssdkService } from './jssdk.service';

export interface LngLat { longitude: number; latitude: number; accuracy: number; }

@Injectable({ providedIn: 'root' })
export class WecomDeviceService {
  private jssdk = inject(WecomJssdkService);

  /** JS-SDK 位置情報（gcj02 火星座標、中国国内の地図と一致） */
  getLocation(): Promise<LngLat> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (res: any) => resolve({
          longitude: res.longitude,
          latitude: res.latitude,
          accuracy: res.accuracy,
        }),
        fail: (err: any) => reject(new Error('位置情報の取得に失敗しました。位置情報権限を確認してください：' + err.errMsg)),
      });
    }));
  }

  /** カメラを起動して撮影（カメラのみ、アルバム不可で不正防止）、localId を返す */
  takePhoto(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        sizeType: ['compressed'],
        success: (res: any) => resolve(res.localIds[0]),
        fail: (err: any) => reject(new Error('撮影に失敗しました：' + err.errMsg)),
      });
    }));
  }

  /** スキャン（席／会議室のQRコード打刻） */
  scanQRCode(): Promise<string> {
    return this.jssdk.ensureWxConfig().then(() => new Promise((resolve, reject) => {
      wx.scanQRCode({
        needResult: 1,              // 1=フロントが結果を受け取って自前で処理
        scanType: ['qrCode'],
        success: (res: any) => resolve(res.resultStr),
        fail: (err: any) => reject(new Error('スキャンに失敗しました：' + err.errMsg)),
      });
    }));
  }
}

/** Haversine距離（メートル）、純粋関数なので共通 utils に置ける */
export function distanceMeters(a: LngLat, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.latitude);
  const dLng = rad(b.lng - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
```

打刻コンポーネントからの呼び出し（`checkin.component.ts`）。表示にはチームの既存 UI ライブラリ（NG-ZORRO の `NzMessageService` など）を利用します。

```typescript
// src/app/mobile/pages/checkin/checkin.component.ts（抜粋）
import { Component, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { WecomDeviceService, distanceMeters } from '../../../wecom/device.service';
import { CheckinService } from '../../../core/services/checkin.service';

@Component({ selector: 'app-checkin', standalone: true, template: '...' })
export class CheckinComponent {
  private device = inject(WecomDeviceService);
  private checkinApi = inject(CheckinService);
  private msg = inject(NzMessageService);

  private readonly COMPANY = { lat: 30.2741, lng: 120.1551, radius: 200 };

  async onCheckin(): Promise<void> {
    const loc = await this.device.getLocation();
    const dist = distanceMeters(loc, this.COMPANY);
    if (dist > this.COMPANY.radius) {
      this.msg.error(`打刻範囲外です。会社から ${Math.round(dist)} メートル`);
      return;
    }
    await firstValueFrom(this.checkinApi.submit({
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      distance: Math.round(dist),
    }));
    this.msg.success('打刻成功');
  }
}
```

バックエンドの打刻 API はシステムの既存実装と同じです（距離の二次検証、重複打刻防止、DB 保存、プッシュ通知）。これらのロジックはすでに存在し、H5 は新しい呼び出し元にすぎません。バックエンドは**距離を必ず再検証し**、フロントエンドから送られる緯度経度を信用してはいけません（フロントの座標はパケットキャプチャで改ざん可能です）。

### 5.5 写真撮影打刻と QR コードスキャン打刻

撮影とスキャンは 5.4 の `WecomDeviceService` にすでにカプセル化済みです（`takePhoto()` は localId を返し、`scanQRCode()` は QR コードの内容を返します）。コンポーネントからはそのまま await で呼び出すだけです。`takePhoto` で取得した localId の画像は別途アップロードが必要です。

- `wx.uploadImage` で先に画像を企業微信（WeCom）にアップロードして `serverId` を取得し、バックエンドが WeCom メディア API `media/get` を呼んでイントラネットに引き戻す方法 — H5 から直接ファイルをアップロードしたくないケースに適しています。
- または、localId を canvas に描画して Blob に変換し、Angular の `FormData` + `HttpClient` で既存のファイルサービスに直接 POST し、システム既存の添付ファイルストレージを再利用する方法。

どちらの方式でも、バックエンドは既存の写真保存とウォーターマーク（時刻＋位置＋端末情報）ロジックをそのまま利用します。QR スキャン打刻では、バックエンドが QR コードのトークンの有効性・有効期限を検証し、位置情報による二重チェックを重ねます。こちらも同様に既存 API を再利用します。
## 6. Activiti の複雑な承認フローの WeCom 側での実装

勤怠に関連する承認（打刻補正（補カード）、休暇、外勤、残業申し立てなど）のフローはすでに Activiti で定義・稼働済みのため、WeCom 側でフローを再実装する必要はありません。必要なのは次の 3 つだけです。**承認待ちタスクを取り出す、承認操作を接続する、承認待ちを能動的に WeCom にプッシュする**。この章では、会签（全員承認）、或签（いずれか1名が承認）、組織構造に基づく承認という 3 つの代表的なノードを例に再利用方法を説明します。

### 6.1 まず処理者の識別子を統一する

Activiti はタスクの処理者（`ACT_RU_TASK.ASSIGNEE_`）または候補者／候補グループ（`ACT_RU_IDENTITYLINK`）を文字列で識別します。次を必ず保証してください。**フロー定義にハードコードされた、または実行時に計算される処理者の識別子が、`sys_user.username`（内部アカウント。wecom_user_id に紐づく一意キーでもある）と一致すること**。

社員番号／ユーザー名（例: `zhangsan`）をシステム全体の一意な人員識別子として統一することを推奨します。

- Activiti の assignee / candidateUser = `sys_user.username`
- WeCom のマッピング = `sys_user.wecom_user_id`（多くの企業では社員番号で、両者が同じ場合もありますが、論理的には分離します）
- WeCom メッセージをプッシュするとき: `username → sys_user を検索 → wecom_user_id を取得` を `touser` とする

これにより、Activiti のフロー定義、UEL 式、候補者クエリのいずれも WeCom 向けに変更する必要がありません。

### 6.2 3 つの代表的ノードのフロー定義での表現

「打刻補正申請」フローを例に、会签（全員承認）、或签（いずれか1名が承認）、組織構造に基づく承認の BPMN での書き方を示します。

**会签（複数人が全員同意して初めて通過）** — マルチインスタンスノード（multiInstanceLoopCharacteristics）＋完了条件を使います。

```xml
<userTask id="countersignLeaderHr" name="直属上司とHRの会签">
  <documentation>全員が承認し、かつ全員が同意して初めて通過。1人でも却下したら終了</documentation>
  <multiInstanceLoopCharacteristics isSequential="false"
                                   activiti:collection="${countersignUsers}"
                                   activiti:elementVariable="approver">
    <completionCondition>${approveResultList.size() == nrOfInstances
        &amp;&amp; !approveResultList.contains('REJECT')}</completionCondition>
  </multiInstanceLoopCharacteristics>
  <userTask><extensionElements/></userTask>
</userTask>
```

- `isSequential="false"`：並列会签。各人に対して同時に task を 1 件生成します
- `nrOfInstances`：会签の総人数。`approveResultList`：各人の承認結果を収集するフロー変数
- 完了条件：全員が処理し、かつ REJECT がなければ次へ進みます

**或签（複数人のうち誰か 1 人が処理すればよい）** — こちらもマルチインスタンスですが、完了条件を「1 件処理したら終了」に変更します。より一般的なのは候補者（candidateUsers）を使う方法で、1 つのタスクを複数人が閲覧でき、引き受けた人が処理します。

```xml
<userTask id="orSignDuty" name="当直グループの或签" activiti:candidateUsers="${dutyGroupUsers}">
  <documentation>候補グループのいずれか1名が引き受けて承認すればよい</documentation>
</userTask>
```

マルチインスタンス ＋ `nrOfCompletedInstances >= 1` で、各人に承認待ちを 1 件ずつ作り、1 人が処理すると残りが自動的にキャンセルされるように実装することもできます。

**組織構造に基づく動的承認** — 処理者をハードコードせず、フロー式が組織構造からリアルタイムに計算します（申請者 → 直属部門責任者 → 管掌役員）。

```xml
<userTask id="deptLeaderApprove" name="部門責任者の承認"
          activiti:assignee="${orgService.findLeader(applyUserId)}"/>
<userTask id="directorApprove" name="管掌役員の承認"
          activiti:assignee="${orgService.findDirector(applyUserId)}"/>
```

`orgService` は Activiti の式コンテキストに登録された Spring Bean で、内部で部門ツリーを上方向にたどって責任者を検索します。部門責任者が異動しても、新しいフローインスタンスは最新の組織構造に従って自動的にルーティングされ、フロー定義の変更は不要です。

> この BPMN は PC 版ですでに稼働しています。WeCom 側はあくまで「処理の入り口」が増えるだけで、処理アクションの下位で呼ばれるのは同じ `taskService.complete()` です。そのため、会签のカウント、或签の引き受け、組織ルーティング、ゲートウェイ条件はすべてエンジンが一貫性を保証し、「PC とスマホで通るフローが違う」という問題は発生しません。

### 6.3 WeCom 側の承認待ち一覧と詳細

**承認待ち一覧** — Activiti の TaskQuery をそのまま使い、現在ログイン中のユーザーの username で承認待ちを検索します（会签では各人に個別の task があり、或签の候補者タスクは taskCandidateUser で検索します）。

```java
/**
 * モバイル承認 Service（Activiti TaskService を再利用）
 *
 * @author cuckoom
 */
@Service
public class MobileApprovalService {

    @Resource
    private TaskService taskService;
    @Resource
    private HistoryService historyService;
    @Resource
    private RepositoryService repositoryService;

    /** 現在のユーザーの承認待ち（直接指派＋或签の候補・未引き受けを含む） */
    public List<TodoVO> listMyTodo(String username) {
        List<Task> owned = taskService.createTaskQuery()
                .taskAssignee(username)
                .active()
                .orderByTaskCreateTime().desc()
                .list();

        List<Task> candidate = taskService.createTaskQuery()
                .taskCandidateUser(username)
                .active()
                .list();

        return Stream.concat(owned.stream(), candidate.stream())
                .distinct()
                .map(this::toTodoVO)
                .collect(Collectors.toList());
    }

    private TodoVO toTodoVO(Task task) {
        Map<String, Object> vars = taskService.getVariables(task.getId());
        BpmnModel model = repositoryService.getBpmnModel(task.getProcessDefinitionId());
        String nodeType = readNodeType(model, task.getTaskDefinitionKey()); // COUNTERSIGN/ORSIGN/NORMAL

        return TodoVO.builder()
                .taskId(task.getId())
                .processInstanceId(task.getProcessInstanceId())
                .title(String.valueOf(vars.getOrDefault("title", task.getName())))
                .nodeName(task.getName())
                .nodeType(nodeType)
                .applyUserName(String.valueOf(vars.get("applyUserName")))
                .createTime(task.getCreateTime())
                .candidate(Objects.isNull(task.getAssignee()))  // 或签の未引き受け
                .build();
    }
}
```

**承認詳細** — フォーム、会签の進捗（誰が同意済みで誰が未処理か）、承認コメントのタイムラインを表示します。

```java
/** 会签の進捗：履歴タスク＋現在のタスクから各処理者のステータスを集計する */
public List<ApproverProgressVO> countersignProgress(String processInstanceId) {
    List<HistoricTaskInstance> done = historyService.createHistoricTaskInstanceQuery()
            .processInstanceId(processInstanceId)
            .finished()
            .list();
    List<Task> pending = taskService.createTaskQuery()
            .processInstanceId(processInstanceId)
            .list();
    // マージ：done には承認コメント（COMMENT）が付き、pending は「承認待ち」とする
    // 組み立ては省略。[{user, userName, status: APPROVED/REJECTED/PENDING, comment, time}] を返す
    return mergeProgress(done, pending);
}
```

フロントエンドの `ApprovalDetailComponent` は `nodeType` に応じて描画します。会签なら複数アバターの進捗バー（処理済み／未処理）を表示し、或签なら「当直グループのメンバーは誰でも承認できます。タップして引き受けてください」と表示します。

### 6.4 引き受け（或签）と承認操作

或签の候補タスクは、まず引き受け（claim）を行って assignee にならなければ処理できません。会签タスクは直接指派されるため、引き受けはスキップします。

```java
@Transactional(rollbackFor = Exception.class)
public void approve(String taskId, String username, boolean agree, String comment) {
    Task task = taskService.createTaskQuery().taskId(taskId).active().singleResult();
    if (task == null) {
        throw new BusinessException(ErrorCode.TASK_NOT_FOUND, "承認待ちが存在しないか、すでに処理済みです");
    }

    // 或签：候補者タスクはまず引き受ける
    if (task.getAssignee() == null) {
        boolean isCandidate = taskService.createTaskQuery()
                .taskId(taskId).taskCandidateUser(username).count() > 0;
        if (!isCandidate) {
            throw new BusinessException(ErrorCode.NO_PERMISSION, "このタスクを処理する権限がありません");
        }
        taskService.claim(taskId, username);
    } else if (!username.equals(task.getAssignee())) {
        throw new BusinessException(ErrorCode.NO_PERMISSION, "このタスクはあなたに割り当てられていません");
    }

    // 承認コメントを記録
    Authentication.setAuthenticatedUserId(username);
    taskService.addComment(taskId, task.getProcessInstanceId(),
            (agree ? "同意：" : "却下：") + comment);

    // フロー変数を書き戻す：会签の完了条件は approveResultList に依存
    Map<String, Object> vars = new HashMap<>();
    if (isCountersign(task)) {
        @SuppressWarnings("unchecked")
        List<String> results = (List<String>) taskService.getVariable(taskId, "approveResultList");
        if (results == null) results = new ArrayList<>();
        results.add(agree ? "APPROVE" : "REJECT");
        vars.put("approveResultList", results);
    }
    vars.put("approved", agree);

    taskService.complete(taskId, vars);

    // 承認後処理：次ノードの承認待ちをプッシュ、フロー終了時に勤怠と連携（6.5、6.6 参照）
    afterTaskComplete(task.getProcessInstanceId(), agree);
}
```

却下ポリシーは企業のルールに応じて選択できます。起票者へ差し戻し（再提出）、1 つ前のノードへ差し戻し、またはフローを即時終了します。打刻補正では「1 人でも却下したら終了＋起票者へ通知」がよく使われ、これは会签の完了条件 `!contains('REJECT')` のセマンティクスそのものです。

### 6.5 承認と勤怠データの連携（既存機能を流用）

フロー終了時に業務タイプに応じて勤怠へ書き戻します。このロジックはシステムにすでに存在し、WeCom 側の承認がトリガーするのも同じ `taskService.complete()` であるため、連携は当然そのまま機能します。打刻補正の代表的な処理は次のとおりです。

```java
public void afterProcessFinished(String processInstanceId) {
    // フロー終了後、フローインスタンス変数は履歴テーブルへ移行済み。業務変数は HistoricVariableInstance から取得
    Map<String, Object> vars = historyService.createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .list()
            .stream()
            .collect(Collectors.toMap(HistoricVariableInstance::getVariableName,
                    HistoricVariableInstance::getValue, (a, b) -> a));
    String bizType = String.valueOf(vars.get("bizType"));     // MAKEUP / LEAVE / OVERTIME
    Boolean approved = (Boolean) vars.get("approved");

    if (!Boolean.TRUE.equals(approved)) {
        notifyApplicant(processInstanceId, false);   // 却下通知
        return;
    }

    switch (bizType) {
        case "MAKEUP":
            // 補カード承認：該当日の打刻記録を修正・補登録する（既存の勤怠 Service）
            attendanceService.applyMakeupCard(
                (Long) vars.get("recordId"),
                (String) vars.get("makeupTime"),
                String.valueOf(vars.get("reason")));
            break;
        case "LEAVE":
            // 休暇承認：休暇を書き込み、休暇残日数を減らす
            leaveService.grantLeave(vars);
            break;
        default:
            break;
    }
    notifyApplicant(processInstanceId, true);
}
```

各承認 API から手動で呼ぶより、Activiti のフロー終了イベントをリスナーで監視してトリガーするほうが堅牢です（PC、WeCom、定期タスクのどの入口で完了しても必ず通ります）。

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;

/**
 * Activiti フロー終了リスナー：承認が最終終了した後に勤怠と連携する
 * RuntimeService.addEventListener(...) または ProcessEngineConfiguration で登録
 */
@Component
public class ApprovalProcessListener implements ActivitiEventListener {

    @Resource
    private ApprovalFlowService approvalFlowService;

    @Override
    public void onEvent(ActivitiEvent event) {
        if (event.getType() == ActivitiEventType.PROCESS_COMPLETED) {
            approvalFlowService.afterProcessFinished(event.getProcessInstanceId());
        }
    }

    @Override
    public boolean isFailOnException() {
        return false;   // リスナーの例外はフロー自体に影響させない
    }
}
```

### 6.6 承認待ちの企業微信（WeCom）への能動プッシュ

H5 の承認待ち一覧があるだけでは不十分です — 従業員は自分から一覧を開きにいきません。フローが遷移して新しい承認待ちが発生したら、バックエンドは「承認カード」を次の処理者の WeCom に能動的にプッシュし、カードタップで H5 の該当承認詳細ページを直接開かせます。第 4 章のシングルサインオン（免登）により、開いた時点でログイン済みになっています。

タスク作成リスナーでプッシュをトリガーします（Activiti イベントリスナー）。

```java
import org.activiti.engine.delegate.event.ActivitiEntityEvent;
import org.activiti.engine.delegate.event.ActivitiEventListener;
import org.activiti.engine.delegate.event.ActivitiEventType;
import org.activiti.engine.impl.persistence.entity.TaskEntity;
import org.activiti.engine.task.IdentityLink;

@Component
public class WecomTodoPushListener implements ActivitiEventListener {

    @Resource private WecomMessageService wecomMessageService;
    @Resource private SysUserMapper userMapper;
    @Resource private TaskService taskService;

    @Override
    public void onEvent(org.activiti.engine.delegate.event.ActivitiEvent event) {
        if (event.getType() != ActivitiEventType.TASK_CREATED) return;
        TaskEntity task = (TaskEntity) ((ActivitiEntityEvent) event).getEntity();

        // 直接指派（会签は各人に 1 タスク）→ assignee にプッシュ
        if (StrUtil.isNotBlank(task.getAssignee())) {
            pushToUser(task, task.getAssignee());
        } else {
            // 或签の候補タスク → 全候補者／候補グループを展開したメンバーにプッシュし、入室順に引き受け
            for (IdentityLink link : taskService.getIdentityLinksForTask(task.getId())) {
                if (StrUtil.isNotBlank(link.getUserId())) {
                    pushToUser(task, link.getUserId());
                } else if (StrUtil.isNotBlank(link.getGroupId())) {
                    // 候補グループ：グループからメンバーの username を取得して個別にプッシュ（実装は省略）
                    userMapper.findUsernamesByGroup(link.getGroupId())
                            .forEach(username -> pushToUser(task, username));
                }
            }
        }
    }

    private void pushToUser(TaskEntity task, String username) {
        SysUser u = userMapper.findByUsername(username);
        if (u == null || StrUtil.isBlank(u.getWecomUserId())) {
            log.warn("ユーザー {} は企業微信が未バインドのため承認待ちプッシュをスキップします", username);
            return;
        }
        wecomMessageService.sendApprovalTodoCard(u.getWecomUserId(), task);
    }

    @Override
    public boolean isFailOnException() {
        return false;   // プッシュ失敗で Activiti のタスク作成をロールバックしない
    }
}
```

テキストカードメッセージ（タップで H5 の承認ページへ直接遷移）。

```json
{
  "touser": "wangwu",
  "msgtype": "textcard",
  "agentid": 1000002,
  "textcard": {
    "title": "承認待ち：李四の打刻補正申請",
    "description": "ノード：直属上司の承認<br/>補正日：2026-09-08 午前<br/>理由：外勤の顧客先で打刻を忘れた",
    "url": "https://attendance.yourcompany.com/mobile/approval/123456",
    "btntxt": "今すぐ承認"
  }
}
```

重要なポイント：**カードの url は承認詳細ページまで直接組み立てる** ことです。従業員がタップ → トークンなし → 第 4 章の OAuth サイレント免登 → コールバック後に `state` で渡したリダイレクトで戻るパス（4.3 の redirectPath）を使って、この承認詳細に戻ります。これを実現するには、メッセージカードのリンクに WeCom 規定の免登パラメータを付けるか、フロントのガードですべての `/mobile/**` にログインを強制するだけでよく、特別な処理は不要です。

**テンプレートカードのボタンコールバック（発展：ページを開かずにその場で同意／却下）**

承認者が通知内で直接「同意／拒否」をタップできるようにするには、`template_card`（button_interaction）と第 6 章のコールバック受信を使い、バックエンドがボタンイベントを受け取ったら直接 `mobileApprovalService.approve()` を呼び、カードの状態を更新します。この方式は承認操作が極めて単純なノード（ワンクリック同意）に適しています。コメント入力や会签の詳細確認が必要な場合は、引き続き H5 へ遷移させることを推奨します。どちらの方式でも下位で呼ばれる承認メソッドは完全に同一です。

### 6.7 組織構造同期：動的承認者へ確実にプッシュできるようにする

「組織構造に基づく承認」で動的に算出される処理者は username なので、プッシュ時にその wecom_user_id を引ける必要があります。保障方法は 2 つあります。

1. **アドレス帳コールバックの増分同期**（推奨、リアルタイム）：`change_contact` イベント（メンバーの追加／更新／削除、部門変更）を購読し、`sys_user` の wecom_user_id と所属部門をリアルタイムに更新します。
2. **定期全量同期**：毎日未明にアドレス帳の部門／メンバー API を呼んで全量を突き合わせ、フォールバックとします。

```
GET /cgi-bin/department/list?id=0            # 部門ツリー
GET /cgi-bin/user/list?department_id=1&fetch_child=1   # 部門メンバー詳細
```

同期時には社員番号（username）で突き合わせ、WeCom の userid を `sys_user.wecom_user_id` に書き戻し、部門関係も同期して、`orgService.findLeader()` の組織ルーティングとプッシュ先アドレッシングに利用します。アドレス帳読み取り API には 1 日あたりの呼び出し上限があります（9.4 参照）。そのため必ず「増分コールバックを主軸＋毎日 1 回の全量フォールバック」とし、高頻度ポーリングは避けてください。
## 7. メッセージプッシュとイベントコールバック

### 7.1 access_token とメッセージ送信

アプリメッセージはすべてサーバー側から送信します。API は次のとおりです。

```
POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=TOKEN
```

よく使うメッセージタイプ：

- `text`：勤怠リマインダーなどのプレーンテキスト
- `textcard`：タイトル＋説明＋ボタン。タップで H5 へ遷移（承認待ちの第一選択）
- `template_card`：インタラクティブボタン付き。通知内で直接操作可能（コールバックと併用）
- `markdown`：承認サマリーなどのリッチテキスト（企業微信内でサポート）

プッシュサービスのカプセル化（`duplicate_check_interval` で短時間の重複プッシュを防止します）。

```java
@Service
@Slf4j
public class WecomMessageService {

    @Resource private WecomTokenManager tokenManager;
    @Resource private RestTemplate restTemplate;
    @Value("${wecom.agentid}") private Integer agentId;

    /** 承認待ちカードを送信。タップで H5 の承認詳細へ遷移 */
    public void sendApprovalTodoCard(String wecomUserId, Task task) {
        Map<String, Object> card = new HashMap<>();
        card.put("title", "承認待ち：" + task.getName());
        card.put("description", "新しい承認待ちが 1 件あります。処理してください");
        card.put("btntxt", "今すぐ承認");
        card.put("url", "https://attendance.yourcompany.com/mobile/approval/" + task.getId());

        Map<String, Object> msg = new HashMap<>();
        msg.put("touser", wecomUserId);
        msg.put("msgtype", "textcard");
        msg.put("agentid", agentId);
        msg.put("textcard", card);
        msg.put("duplicate_check_interval", 1800);

        send(msg);
    }

    public void send(String msg) { /* message/send へ POST し、invaliduser/errcode を記録 */ }
}
```

> レスポンスの `invaliduser`／`invalidparty` は必ず記録してください。プッシュ先の中に未バインド、または可視範囲外の人がいることを示しており、「なぜあの人に承認待ち通知が届かないのか」を調査する際の最初の手がかりになります。

### 7.2 コールバックの署名検証と暗号化／復号

「メッセージ受信」を設定すると、企業微信（WeCom）はコールバック URL に対して 2 種類のリクエストを送信します。

- **GET**：設定保存時の URL 有効性検証。`echostr` を復号してそのまま返す必要があります
- **POST**：本番のイベントプッシュ（テンプレートカードのボタン、アドレス帳変更）。暗号文 XML で、署名検証＋AES 復号が必要です

```java
@RestController
@RequestMapping("/api/wecom/callback")
@Slf4j
public class WecomCallbackController {

    @Resource private WecomCallbackService callbackService;

    /** URL 検証 */
    @GetMapping("/message")
    public String verify(@RequestParam("msg_signature") String signature,
                         @RequestParam String timestamp,
                         @RequestParam String nonce,
                         @RequestParam String echostr) {
        try {
            return callbackService.verifyUrl(signature, timestamp, nonce, echostr);
        } catch (Exception e) {
            log.error("WeCom コールバック URL 検証に失敗しました", e);
            return "";
        }
    }

    /** イベント受信：必ず速やかに success を返し、時間のかかる処理は非同期化して WeCom の再試行を防ぐ */
    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String signature,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            callbackService.handleAsync(signature, timestamp, nonce, encryptedBody);
        } catch (Exception e) {
            log.error("WeCom コールバック処理に失敗しました", e);
        }
        return "success";   // 業務の成否にかかわらず先に success を返し、指数バックオフによる再試行を防ぐ
    }
}
```

暗号化／復号を自作してはいけません。公式の `aes-256` サンプルコードパッケージ（企業微信公式が提供する Java 版 `WXBizMsgCrypt`）をそのまま使います。これは SHA1 署名検証、AES-256-CBC 復号、corpId 検証、XML 組み立てをカプセル化しています。`Token`、`EncodingAESKey`、`corpid` の 3 つのパラメータは管理画面のコールバック設定から取得します。

### 7.3 テンプレートカードのボタンとアドレス帳イベントの処理

```java
@Service
@Slf4j
public class WecomCallbackService {

    @Resource private MobileApprovalService approvalService;
    @Resource private ContactSyncService contactSyncService;
    @Resource private WXBizMsgCrypt crypt;   // 公式の暗号化／復号クラス

    /** 復号後、イベントタイプごとに振り分ける */
    public void handle(String sig, String ts, String nonce, String body) throws Exception {
        String xml = crypt.DecryptMsg(sig, ts, nonce, body);
        // XStream/Digester で XML を解析し、Event / ChangeType / TaskId / EventKey / FromUserName を取得
        CallbackEvent event = CallbackEvent.parse(xml);

        switch (event.getEvent()) {
            case "template_card_event":
                // テンプレートカードのボタン：EventKey がボタン key、FromUserName がタップした人の userid
                onCardButton(event);
                break;
            case "change_contact":
                contactSyncService.handleChange(event.getChangeType(), event.getUserId());
                break;
            default:
                log.info("未処理の WeCom イベント: {}", xml);
        }
    }

    private void onCardButton(CallbackEvent e) {
        boolean agree = "approve".equals(e.getEventKey());
        String username = contactSyncService.wecomUserIdToUsername(e.getFromUserName());
        // task_id はカード送信時にこちらで生成して Activiti の taskId と関連付け、Redis/DB に保存して取り戻す
        String taskId = taskCardMapping.get(e.getTaskId());
        approvalService.approve(taskId, username, agree, agree ? "同意" : "却下");
        // update_template_card を呼んで元カードを「同意済み／却下済み」に更新し、重複タップを防げる
    }
}
```

イベント処理は必ず**冪等**にしてください。WeCom はタイムアウト時に同じイベントを再プッシュする可能性があります。`approve` は内部で「タスク終了済み／処理済み」を判定しており（6.4 で active なタスクを検索）、再プッシュされても二重承認は発生しません。時間のかかる操作（複数メッセージの送信、複数テーブルへの書き込みなど）は非同期スレッドまたはメッセージキューに流し、コールバックが秒単位で `success` を返せるようにします。

## 8. サーバー側インフラ

### 8.1 access_token / jsapi_ticket の集中管理

どちらのチケットも有効期間は 7200 秒で、同一企業・同一アプリにつき一意です（重複取得すると古いものが失効します）。そのためサーバー側で集中キャッシュする必要があります。複数インスタンス構成では分散ロックを使い、リフレッシュするインスタンスが 1 つだけになるようにします。

```java
@Component
@Slf4j
public class WecomTokenManager {

    private static final String TOKEN_KEY = "wecom:access_token";
    private static final String LOCK_KEY  = "wecom:access_token:lock";
    private static final long EXPIRE_SECONDS = 7100;   // 7200 より 100 秒の余裕を持たせる

    @Value("${wecom.corpid}") private String corpId;
    @Value("${wecom.secret}") private String secret;
    @Resource private StringRedisTemplate redis;
    @Resource private RestTemplate restTemplate;

    public String getAccessToken() {
        String cached = redis.opsForValue().get(TOKEN_KEY);
        if (StrUtil.isNotBlank(cached)) return cached;

        Boolean locked = redis.opsForValue().setIfAbsent(LOCK_KEY, "1", 10, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(locked)) return waitForToken();   // 他のインスタンスのリフレッシュを待つ

        try {
            String again = redis.opsForValue().get(TOKEN_KEY);      // 二重チェック
            if (StrUtil.isNotBlank(again)) return again;
            return refresh();
        } finally {
            redis.delete(LOCK_KEY);
        }
    }

    private String refresh() {
        String url = String.format(
            "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s", corpId, secret);
        JSONObject resp = restTemplate.getForObject(url, JSONObject.class);
        if (resp == null || resp.getIntValue("errcode") != 0) {
            throw new BusinessException(ErrorCode.WECOM_API_ERROR, "access_token の取得に失敗しました");
        }
        String token = resp.getString("access_token");
        redis.opsForValue().set(TOKEN_KEY, token, EXPIRE_SECONDS, TimeUnit.SECONDS);
        return token;
    }

    private String waitForToken() {
        for (int i = 0; i < 10; i++) {
            sleep(200);
            String t = redis.opsForValue().get(TOKEN_KEY);
            if (StrUtil.isNotBlank(t)) return t;
        }
        throw new BusinessException(ErrorCode.WECOM_API_ERROR, "access_token の取得がタイムアウトしました");
    }

    public String getCorpId() { return corpId; }
}
```

`jsapi_ticket` と agent_config の ticket も、まったく同じパターンで個別にキャッシュすればよいです（キャッシュキーは分けてください）。

### 8.2 機微設定の分離

corpid／agentid は公開可能ですが、secret、コールバック Token、EncodingAESKey は環境変数または設定センター経由で注入し、Git にコミットしてはいけません。

```yaml
# application-prod.yml
wecom:
  corpid: ${WECOM_CORPID}
  agentid: ${WECOM_AGENTID}
  secret: ${WECOM_SECRET}
  oauth:
    redirect: https://attendance.yourcompany.com/mobile/oauth/callback
  jssdk:
    # 署名に関与するフロントエンドドメイン。バックエンドの検証／リンク生成に使用
    frontend-base: https://attendance.yourcompany.com
  callback:
    token: ${WECOM_CALLBACK_TOKEN}
    encoding-aes-key: ${WECOM_CALLBACK_AES_KEY}
```

### 8.3 API セキュリティ

- OAuth ログインエンドポイントと WeCom コールバックエンドポイントは許可し、それ以外はすべて既存の JWT 認証を通す
- `state` は使い捨てのランダム文字列＋sessionStorage 検証で CSRF を防止
- code は 1 回限り・有効期限 5 分。バックエンドは受信直後に交換し、絶対にキャッシュしない
- 打刻座標はバックエンドが距離を二次検証し、フロントを信用しない。写真にはウォーターマーク、QR スキャンには位置情報を重ねる
- コールバック API は署名検証＋AES 復号＋corpId 検証を行い、偽造イベントを拒否
- 重要な API はレート制限（Redis のスライディングウィンドウ）で総当たりを防止

### 8.4 アドレス帳同期サービス

```java
@Service
public class ContactSyncService {

    /** 全量同期（毎日未明のフォールバック） */
    public void syncAll() {
        String token = tokenManager.getAccessToken();
        // 1. 部門ツリー department/list
        // 2. 末端部門をたどり user/list?fetch_child=1 でメンバーを取得
        // 3. 社員番号を sys_user.username に突き合わせ、wecom_user_id、部門、氏名、携帯、ステータスを書き戻す
        // 4. WeCom status=5（退職）／メンバー削除イベント → システムアカウントを無効化
    }

    /** 増分イベント（リアルタイム） */
    public void handleChange(String changeType, String wecomUserId) {
        switch (changeType) {
            case "create_user": case "update_user": upsertOne(wecomUserId); break;
            case "delete_user": disableByWecomUserId(wecomUserId); break;
            // 部門変更は部門テーブルを同期し、orgService.findLeader の組織ルーティングに利用
            default: break;
        }
    }

    public String wecomUserIdToUsername(String wecomUserId) {
        return userMapper.findUsernameByWecomId(wecomUserId);
    }
}
```

## 9. ネットワーク分離下の公開中継ゲートウェイ

これまでの章では、バックエンドサービスが企業微信（WeCom）クラウドとユーザーのスマホから直接アクセスできることを前提にしていました。しかし、多くの企業の勤怠システムは**イントラネットの分離ゾーン**に配置されています。公網 IP がなく、インバウンドアクセスが許可されず、サーバー自身も公網に直接出られないケースさえあります。企業微信のサーバーは公網側にあり、スマホ端末は企業イントラネットの外（外勤の 4G/5G）にあるため、どちらからもこのシステムに直接アクセスできません。こうした場合、DMZ（隔離ゾーン）に**公開中継ゲートウェイ**を別途デプロイします。このゲートウェイは、一方で企業微信とスマホから到達可能であり、もう一方で制御された経路を通じてイントラネットの勤怠システムにアクセスできます。

### 9.1 ネットワークの現状と目標

代表的な現状：

- イントラネットの勤怠システム（SpringBoot + PostgreSQL + Redis + Activiti）はオフィスネットワークにのみ公開（例: `http://10.10.20.30:8080`）
- 境界ファイアウォールはデフォルトですべての公網からのインバウンドを拒否
- スマホが企業微信に接続するとき（特に外勤）のトラフィックは公網を通り、`10.x` のイントラアドレスへはルーティングできない
- 企業微信の OAuth コールバック、JS-SDK の信頼ドメイン、イベントコールバックには、いずれも**公網から到達可能で ICP 登録済みの HTTPS ドメイン**が必要

目標：

- ユーザーのスマホで H5 ページが正常に読み込まれ、シングルサインオン（免登）が完了し、勤怠・承認 API を呼べること
- 企業微信クラウドが OAuth 認可結果やメッセージカードのイベントコールバックを届けられること
- イントラネットのシステムを**公網に直接公開せず**、データベース、Activiti、業務ロジックは引き続き安全にイントラに留めること
- 公網側が侵害されても、影響範囲をゲートウェイに限定し、業務データベースへの到達やイントラ内の水平展開を防ぐこと

### 9.2 2 つの接続モデル

| モデル | 接続方向 | 適用前提 | 特徴 |
|------|----------|----------|------|
| モデル 1：DMZ ゲートウェイ＋ファイアウォールホワイトリストのリバースプロキシ | DMZ ゲートウェイ → イントラ（境界 FW が指定ポートのみ許可） | ファイアウォールで「DMZ→イントラ」の制限付きアクセスポリシーを設定できる | 最も一般的、経路が短い、性能が良い、監査が明確。**本稿の主力構成** |
| モデル 2：イントラから能動的に接続するリバーストンネル | イントラ → DMZ／公網へ能動的にトンネルを確立（frp／WireGuard） | イントラが一切のインバウンドを許可せず、アウトバウンドのみ許可 | 境界にインバウンドポリシーを開ける必要がなく、穿透能力が高い。運用・監査はより複雑 |

大半の企業はモデル 1 を選びます。DMZ にゲートウェイサーバーを 1 台置き、境界ファイアウォールでは「ゲートウェイ IP → イントラ勤怠サービス IP:ポート」の 1 本だけをホワイトリストで許可します。セキュリティポリシーが厳しく DMZ からイントラへの能動接続も許可できない場合は、モデル 2 でイントラから能動的に接続します（9.7 参照）。

### 9.3 推奨アーキテクチャ：ゲートウェイを「企業微信アダプター層」とする

重要な設計原則：**公網ゲートウェイを単なる Nginx の転送装置ではなく、企業微信向けのアダプター層（BFF）とする** ことです。企業微信クラウドとの通信をすべてゲートウェイに集約し、イントラのシステムは企業微信のプロトコルを一切意識しないようにします。

```
 企業微信クラウド              スマホの企業微信(公網/4G)
 gettoken/getuserinfo/        │
 message send/イベントCB        │ H5を開く、API呼出
        │                      │
        ▼                      ▼
┌─────────────────────────────────────────────┐
│            DMZ 公開中継ゲートウェイ（唯一の公開面） │
│  Nginx(443, HTTPS/登録済ドメイン/静的H5/WAF)  │
│  WeCom Gateway (SpringBoot、WeCom適合層)      │
│   · OAuth code→userid（secretを保持）         │
│   · jsapi_ticket / 署名                       │
│   · メッセージ代送 message/send               │
│   · イベントCB署名検証/AES復号                │
│   · access_token 集中キャッシュ(Redis/ローカル)│
│   · 業務DBを持たない、業務PostgreSQLに未接続   │
└───────────────┬─────────────────────────────┘
                │  制御された内部経路（mTLS＋内部トークン）
                │  FWホワイトリスト： ゲートウェイIP→内网10.10.20.30:8080 のみ
                ▼
┌─────────────────────────────────────────────┐
│          イントラ勤怠システム（既存、公網非開示） │
│  SpringBoot：勤怠 / Activiti / アカウント紐付け / JWT
│  PostgreSQL · Redis · 組織構造               │
│  /internal/** の内部信頼APIを新設するだけ      │
└─────────────────────────────────────────────┘
```

責務の分割（きわめて重要）：

| 機能 | 公網ゲートウェイに置く | イントラシステムに残す |
|------|:---:|:---:|
| corpid/secret/EncodingAESKey の保持 | ✅ | ❌ |
| WeCom クラウドの呼び出し（gettoken、getuserinfo、get_jsapi_ticket、message/send） | ✅ | ❌ |
| OAuth コールバックの着地点、コールバックメッセージの署名検証・復号 | ✅ | ❌ |
| H5 静的リソースのホスティング（CDN/OSS でも可） | ✅ | ❌ |
| アカウント紐付けマッピング（wecom_user_id ↔ 内部アカウント） | ❌ | ✅ |
| 業務 JWT の発行／検証、勤怠、Activiti、組織構造 | ❌ | ✅ |
| PostgreSQL/Redis の業務データ | ❌ | ✅ |
| 通常業務 API（/api/…）の透過 | リバースプロキシのみ | ✅ 処理 |

これにより、ゲートウェイが侵害されても攻撃者は業務データベースのデータを取得できず、ゲートウェイには長期有効なイントラ資格情報も含まれません（内部トークンは短時間有効で失効可能）。

### 9.4 分離ネットワーク下の免登リンク（第 4 章との違い）

第 4 章では前後端が同一オリジンで、バックエンドが直接 WeCom を呼べる前提でした。ゲートウェイを挟むと、「code を userid に交換」するのはゲートウェイ、「userid を内部アカウントに交換して JWT を発行」するのはイントラとなり、間に**内部信頼呼び出し**が 1 ホップ増えます。

```
スマホH5        DMZゲートウェイ             イントラ勤怠      WeComクラウド
 │                │                          │                │
 │ tokenなし→OAuth │                          │                │
 │◀───────────────│                          │                │
 │ サイレント認可で?code付きで戻る              │                │
 │───────────────▶│ gettoken/getuserinfo ───────────────────▶│
 │                │◀──────────────────── userid ─────────────│
 │                │ POST /internal/wecom/assert {userid}     │
 │                │  (mTLS＋X-Internal-Token ゲートウェイ令牌) │
 │                │─────────────────────────▶│ 紐付け検索      │
 │                │                          │ 内部JWT発行     │
 │                │◀──────────────────── JWT ────────────────│
 │◀───────────────│ 内部JWTをフロントへ                        │
 │ 以降 /api/** にJWT付与                      │               │
 │───────────────▶│ Nginxリバプロ(JWT透過)────▶│ 勤怠/承認     │
```

ポイント：

- **secret はゲートウェイだけ**に置き、イントラのシステムには WeCom の鍵を設定する必要も、すべきでもない
- イントラには内部信頼 API `/internal/wecom/assert` を 1 つ新設するだけです。入力は userid、出力はシステム独自の JWT。これは**公網に公開せず**、ゲートウェイからの、かつ内部トークン／mTLS を持つ呼び出しだけを受け付ける
- 業務 API `/api/**` についてゲートウェイはリバースプロキシとして JWT を透過するだけで、認可は引き続きイントラの Spring Security が行います（4.7 参照）。ゲートウェイは業務を解釈しない

**ゲートウェイ側：code を userid に交換し、内部 JWT を取得**

```java
/**
 * DMZ ゲートウェイ：WeCom OAuth アダプター
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/wecom")
@Slf4j
public class GatewayOAuthController {

    @Resource
    private WecomTokenManager tokenManager;      // gettoken＋Redisキャッシュ、8.1 参照
    @Resource
    private InternalAttendanceClient internalClient;  // イントラの内部信頼APIを呼ぶ

    /** OAuth コールバック：code -> WeCom userid -> イントラ JWT */
    @GetMapping("/oauth/callback")
    public void callback(@RequestParam("code") String code,
                         @RequestParam("state") String state,
                         HttpServletResponse resp) throws IOException {
        String userid = exchangeUserid(code);               // ゲートウェイがWeComクラウドを呼ぶ
        String jwt = internalClient.assertWecomUser(userid); // ゲートウェイがイントラからJWTを取得

        String redirect = stateService.consumeTarget(state); // stateから元の目標ページを復元しCSRF検証
        // 使い捨ての中継ページ経由で JWT をフロントへ渡す（localStorage書込み後に目標ページへ）
        resp.sendRedirect("/oauth-bridge.html#token="
                + URLEncoder.encode(jwt, StandardCharsets.UTF_8)
                + "&redirect=" + URLEncoder.encode(redirect, StandardCharsets.UTF_8));
    }

    private String exchangeUserid(String code) {
        String token = tokenManager.getAccessToken();
        String url = "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo"
                + "?access_token=" + token + "&code=" + code;
        JSONObject json = restTemplate.getForObject(url, JSONObject.class);
        if (json == null || json.getIntValue("errcode") != 0
                || StrUtil.isBlank(json.getString("userid"))) {
            throw new BusinessException(ErrorCode.WECOM_USER_NOT_IN_SCOPE, "アプリの認可範囲外です");
        }
        return json.getString("userid");
    }
}
```

> 内部 JWT を URL に長く含めないでください（ゲートウェイ／Nginx のログやブラウザ履歴に残ります）。上記では使い捨ての `/oauth-bridge.html` を使います。ページのスクリプトが hash 内の token を読み取り（hash はサーバーへ送信されず、サーバーログにも残りません）、localStorage に書き込んだ直後に `history.replaceState` で消去してから目標ページへ遷移します。state は 4.3 どおり CSRF 検証と元パスの復元を行います。

**イントラ側：ゲートウェイからの呼び出しだけを受ける内部信頼 API**

```java
/**
 * イントラ：企業微信の身元アサーション API（ゲートウェイのみ呼出可能、公網非開示）
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/internal/wecom")
@Slf4j
public class InternalWecomAssertController {

    @Resource
    private SysUserService userService;
    @Resource
    private JwtTokenProvider jwtTokenProvider;

    @PostMapping("/assert")
    public Result<AssertVO> assertUser(
            @RequestHeader(value = "X-Internal-Token", required = false) String internalToken,
            @RequestBody @Valid AssertDTO dto) {

        // 1. ゲートウェイからの内部トークンを検証（または mTLS 層でクライアント証明書を検証。二者択一または併用）
        if (!internalTokenVerifier.verify(internalToken)) {
            log.warn("内部アサーションAPIへの不正な呼び出し、userid={}", dto.getUserid());
            throw new BusinessException(ErrorCode.FORBIDDEN, "内部APIへのアクセスを拒否します");
        }

        // 2. 4.6 節のアカウント紐付けロジックを再利用（重複アカウントは絶対に作らない）
        SysUser user = userService.getOrBindByWecomUserId(dto.getUserid());

        // 3. システム既存の JWT を発行（パスワードログインと完全に同一）
        String jwt = jwtTokenProvider.generateToken(user.getId(), user.getUsername());
        return Result.success(new AssertVO(jwt, UserInfoVO.of(user)));
    }
}
```

`/internal/**` は Spring Security で個別に設定し、ゲートウェイ IP からのアクセス（または mTLS クライアント証明書付き）だけを許可し、かつ**公網 Nginx のリバースプロキシ location には絶対に含めません**。ネットワーク層とアプリ層の 2 段階で、外部から直接呼ばれないことを保証します。

### 9.5 ゲートウェイとイントラ間の内部信頼（セキュリティの核心）

DMZ からイントラへのこの 1 ホップが、構成全体で最もセキュリティレベルを高くすべき箇所であり、「経路の暗号化＋身元認証＋最小権限」を徹底する必要があります。

- **ネットワーク層のホワイトリスト**：境界ファイアウォールは `ゲートウェイIP:ランダム送信元ポート → イントラ勤怠IP:8080/tcp` のみ許可し、イントラの他ポート・他ホストへは一切到達不可とする。ゲートウェイからデータベース（5432）、Redis（6379）へは**絶対に開通しない**
- **通信暗号化 mTLS**：ゲートウェイとイントラ間は HTTPS の双方向証明書認証とし、イントラはゲートウェイのクライアント証明書だけを信頼する。同一セグメントが盗聴されても偽造も再送もできない
- **アプリ層の内部トークン**：mTLS に加えて短時間有効な `X-Internal-Token`（ゲートウェイが注入しイントラが検証）を置き、二重の保険とする。トークンは環境変数に置き、定期的にローテーションする
- **API の最小化**：イントラに公開するのは `/internal/wecom/assert`（JWT 交換）、`/internal/message/send`（承認待ち代送）、`/internal/callback/event`（コールバックイベント配送）などごく少数の API だけとし、入力は厳格にホワイトリスト検証する
- **リプレイ防止**：内部リクエストにタイムスタンプ＋nonce を付け、イントラ側で時間窓（例: ±5 分）と nonce の一意性を検証する
- **ゲートウェイに業務データを置かない**：ゲートウェイは業務 PostgreSQL に接続せず、access_token などはゲートウェイ専用の Redis またはローカルキャッシュを使う。ログはマスクし、JWT の平文を記録しない

内部トークン検証の例：

```java
@Component
public class InternalTokenVerifier {

    @Value("${internal.gateway.token}")
    private String expectedToken;

    public boolean verify(String token) {
        // タイミングサイドチャネル攻撃を防ぐため、定数時間で比較する
        return StrUtil.isNotBlank(token)
                && MessageDigest.isEqual(
                        token.getBytes(StandardCharsets.UTF_8),
                        expectedToken.getBytes(StandardCharsets.UTF_8));
    }
}
```

### 9.6 イベントコールバックとメッセージプッシュのゾーン間処理

ネットワーク分離環境では、企業微信（WeCom）のイベントコールバック（カードボタン、アドレス帳変更）はまず公開ゲートウェイに着信し、その後ゲートウェイから内网へ配送されるしかありません。一方、内网で発生した承認待ちタスクの通知は、逆方向にゲートウェイ経由で代理送信されます。

**インバウンド：WeComイベントコールバック → ゲートウェイで署名検証・復号 → 内网へ配送**

```java
/**
 * ゲートウェイ側：WeComのコールバックを受信し、署名検証＋AES復号した後、内网へ転送して処理する
 *
 * @author cuckoom
 */
@RestController
@RequestMapping("/wecom/callback")
@Slf4j
public class GatewayCallbackController {

    @Resource
    private WXBizMsgCrypt crypt;                 // 公式の暗号化・復号（secret はゲートウェイに留める）
    @Resource
    private InternalAttendanceClient internalClient;

    @PostMapping(value = "/message", produces = "application/xml")
    public String receive(@RequestParam("msg_signature") String sig,
                          @RequestParam String timestamp,
                          @RequestParam String nonce,
                          @RequestBody String encryptedBody) {
        try {
            // 1. ゲートウェイが署名検証＋AES復号を完了する（内网は EncodingAESKey を知る必要がない）
            String xml = crypt.DecryptMsg(sig, timestamp, nonce, encryptedBody);
            // 2. 署名検証を通過した平文イベントを、内部の信頼チャネル経由で内网へ配送（非同期、内部トークン/mTLS付き）
            internalClient.forwardEvent(xml);
        } catch (Exception e) {
            log.error("WeComコールバックの処理に失敗しました", e);
        }
        return "success";   // ゲートウェイは即座に success を返し、WeComの再プッシュを避ける；内网側の処理は冪等にする
    }
}
```

内网が受け取るのは、すでに署名検証済みの平文イベントです。第7章の `WecomCallbackService` のディスパッチロジックをそのまま再利用します（カードボタン → `approvalService.approve()`、アドレス帳変更 → 増分同期）。ゲートウェイの転送はリトライされる可能性があるため、内网側の処理は必ず冪等にしてください。

**アウトバウンド：内网の承認待ちタスク → ゲートウェイがWeComメッセージを代理送信**

内网は secret を保持せず、公網に直接アクセスできない場合もあるため、Activiti の承認待ちプッシュリスナー（6.6参照）は WeCom を直接呼び出さず、「誰に・どのカードを送るか」をゲートウェイに渡して代理送信させます。

```java
/**
 * 内网側：承認待ち通知を公開ゲートウェイに渡して代理送信する（内网はWeComの secret を保持しない）
 *
 * @author cuckoom
 */
@Service
@Slf4j
public class GatewayMessageRelay {

    @Resource
    private InternalGatewayClient gatewayClient;

    public void sendApprovalTodoCard(String wecomUserId, TodoPushDTO todo) {
        // mTLS/内部トークンでゲートウェイを呼び出す；ゲートウェイがさらに message/send を呼ぶ
        gatewayClient.enqueueMessage(MessageEnvelope.builder()
                .toUser(wecomUserId)
                .msgType("textcard")
                .title("承認待ち：" + todo.getNodeName())
                .description(todo.getSummary())
                .btnText("今すぐ承認")
                // カードのリンクは公開 H5 ドメインを指し、タップ後はシングルサインオン（免登）で該当承認へ直行する
                .url("https://attendance.yourcompany.com/mobile/approval/" + todo.getTaskId())
                .build());
    }
}
```

```java
/**
 * ゲートウェイ側：代理送信サービス（message/send を呼ぶ唯一の場所）
 *
 * @author cuckoom
 */
@Service
public class GatewaySendService {

    @Resource
    private WecomTokenManager tokenManager;

    public void send(MessageEnvelope env) {
        // 内网からの送信元を検証し（mTLS/内部トークンはインターセプタで実施）、WeComのリクエストを組み立てて送信する
        // 「ある人に承認待ちが届かない」の調査用に invaliduser を記録する
        ...
    }
}
```

これにより明確な一方向の責務分担ができます。WeCom関連の鍵とクラウド呼び出しはすべてゲートウェイに集約され、内网は業務の生成と処理だけを行い、狭いインターフェースを通じてメッセージを送受信します。

### 9.7 代替パターン：内网から能動的に張るリバーストンネル

セキュリティポリシーで DMZ から内网への能動的接続が許可されない場合（DMZ→内网のインバウンドが一切禁止）、**内网から DMZ/公開ゲートウェイに対して長時間接続のトンネルを能動的に確立**し、内网側から発信して、すでに許可済みのアウトバウンドポリシーを再利用できます。

- **WireGuard / IPsec トンネル**：ゲートウェイと内网のトンネル用マシン1台の間に暗号化されたピアツーピアネットワークを構築し、内网から能動的に接続してオンラインにします。ゲートウェイから見ると内网サービスはトンネルの対向アドレスになり、9.3 のアプリケーション層認証をそのまま使えます。運用が成熟しており性能も良いため、最優先で検討します
- **frp / rathil などのリバースプロキシ**：内网のクライアント `frpc` が公網の `frps` に能動的に接続し、内网の `8080` をゲートウェイ上のローカルポートにマッピングします。構築は速いですが、公開するポートとプロトコルを厳しく制限し、mTLS/トークンを重ねて、トンネルが「公網から内网への直通バックドア」にならないようにします
- **メッセージキュー/ポーリング中継**：セキュリティ要件が極めて高い場合、内网はゲートウェイ側のキューだけを能動的に消費し（送信待ちコールバックの取得、代理送信結果の返送など）、全行程が内网からのアウトバウンドで、逆方向のインバウンドを一切作りません。レイテンシはやや高くなりますが、攻撃面は最小です

選定の原則：「DMZ＋ファイアウォールのホワイトリスト」で済むならトンネルは使わない。トンネルが必須なら WireGuard のようなネットワーク層ソリューションを優先し、アプリケーション層認証を重ねる。素の frp で内网の管理ポートをそのまま公網にマッピングしてはいけません。

### 9.8 Nginx ゲートウェイのリバースプロキシ設定のポイント

ゲートウェイの Nginx は、TLS 終端、H5 静的リソース、および `/api/**` の内网へのリバースプロキシ（トンネル対向アドレスまたはファイアウォールで到達可能なアドレス経由）を担います。`/internal/**` はここで絶対に公開してはいけない点に注意してください。

```nginx
server {
    listen 443 ssl http2;
    server_name attendance.yourcompany.com;

    ssl_certificate     /etc/nginx/ssl/attendance.crt;
    ssl_certificate_key /etc/nginx/ssl/attendance.key;

    # H5 静的リソース（Angular のビルド成果物、history モードのフォールバック）
    root /data/www/mobile;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 業務 API：内网の勤怠システムへリバースプロキシし、Authorization(JWT) を透過する
    location /api/ {
        proxy_pass https://10.10.20.30:8080;   # または WireGuard トンネルの対向アドレス
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_verify       on;          # 内网向けでも mTLS を使う
        proxy_ssl_trusted_certificate /etc/nginx/mtls/ca.crt;
        proxy_ssl_certificate     /etc/nginx/mtls/gateway.crt;
        proxy_ssl_certificate_key /etc/nginx/mtls/gateway.key;
    }

    # 注意：ここに /internal/ のリバースプロキシを【設定しない】こと。内部インターフェースはゲートウェイ後方の信頼チャネルだけを通す

    # ゲートウェイ自身のWeComコールバック/シングルサインオン（免登）はゲートウェイの SpringBoot アプリが処理する（例：127.0.0.1:8090 で待ち受け）
    location ~ ^/(wecom|oauth-bridge) {
        proxy_pass http://127.0.0.1:8090;
    }
}
```

> フロントエンドのビルド時、API のベース URL を公開ゲートウェイの同一オリジンパス（例：`/api`）に向け、Nginx から内网へ転送します。JS-SDK の署名、OAuth のコールバックドメインには、すべてゲートウェイの公開 ICP 登録済みドメインを使います。内网システムには公開ドメインも証明書も一切不要です。

### 9.9 公開ゲートウェイ自身のセキュリティ強化

DMZ ホストは公開面そのものなので、最小化の原則に従って強化します。

- 443 だけを開放し（必要な SSH は送信元 IP 制限＋鍵認証）、それ以外のポートは閉じる；クラウド WAF / セキュリティグループを前段に配置
- ゲートウェイプロセスは非 root・最小権限で実行；コンテナ配置時はルートファイルシステムを読み取り専用にし、capabilities を drop する
- ゲートウェイは業務データを永続化せず、業務 DB にも接続しない；ログは集中転送し、ディスクに機密情報を長期残留させない
- secret、内部トークン、mTLS の秘密鍵はすべて環境変数/KMS 経由にし、イメージや Git に入れない（8.2参照）
- ゲートウェイから WeCom への出口 IP を WeCom の「企業信頼 IP」ホワイトリストに追加する（10.4 のレート制限とホワイトリストの節を参照）
- レート制限、リプレイ防止、リクエストボディサイズ制限をゲートウェイ層で一律に実施；異常な呼び出しはアラートを発火する
- ゲートウェイと内网の間の内部インターフェースには呼び出し監査を設ける（誰が・いつ・どの内部インターフェースを呼び、userid が何だったか）

## 10. ハマりどころガイド

### 10.1 OAuth シングルサインオン（免登）関連

- **アプリのホームページ/コールバックドメインは必ず「信頼ドメイン」配下にする**こと。さもないと認可ページで `redirect_uri 参数错误`（redirect_uri パラメータエラー）になります。
- **認可リンクには必ず `agentid` を付ける**こと。一部の企業微信バージョンでは、これがないと `getuserinfo` でアプリ身份が取得できません。
- **`appid` に入れるのは corpid** であって agentid ではありません。初心者がよく逆に入れます。
- **userid ではなく openid が返る**：その利用者がアプリの可視範囲に入っていません。アプリの「可視範囲」に該当メンバーの部門が含まれるか確認し、コード内で黙ってアカウントを作らないでください。
- **PC ブラウザでリンクを開いても暗黙的認可されない**：`snsapi_base` は企業微信クライアント内でのみシームレスです。フロントエンドは必ず先に UA を判定し、WeCom 環境以外ではシステムのアカウント名・パスワードログインに進めてください。
- **code は一度しか使えず、5分で失効する**：リダイレクトで戻ったページをリフレッシュすると code の再利用エラーになります。ログイン成功後は `router.replace` で URL 上の code を消し、リフレッシュによる再送を防いでください。

### 10.2 JS-SDK 署名関連

- **iOS は入口ページの URL、Android は現在ページの URL で署名する**（5.3参照）。SPA ではこれが `invalid signature` の最大の原因です。入口 URL は最初のルート遷移の前に記録してください。
- **署名に使う URL と `location.href` は1文字ずつ完全一致が必要**：プロトコル、ドメイン、ポート、query をすべて含める；hash 部分はルールに従って統一的に扱います（history モードにして避けるのが推奨）。
- **フロントが encode するならバックエンドも encode する；どちらもエンコードしないならどちらもしない**。署名文字列の連結順は必ず `jsapi_ticket&noncestr&timestamp&url` です。
- 企業微信専用インターフェースを呼ぶには `wx.config` に `beta: true` を設定し、さらに `wx.agentConfig` をもう一度実行します。
- 実機でのローカルデバッグには、内网侵入（内网穿透）の https ドメインが必須です。hosts 方式はスマートフォンには効きません。

### 10.3 Activiti とアカウントマッピング関連

- **処理者（担当者）の識別子は必ず内部 username に統一する**こと。wecom_user_id を BPMN の assignee に直接書かないでください。身份ソースを変えたとき（将来 DingTalk/Feishu を接続する等）、フロー定義をすべて書き換えることになります。
- **wecom_user_id で重複アカウントを新規作成しない**：既存システムの第一原則はバインドによるマッピング（4.6）です。さもないと勤怠データと履歴の承認待ちが二人の人物に分裂します。
- **或签（いずれか1名が承認）の候補タスクは処理前に必ず claim する**こと。签收（claim）せずに complete すると、タスクが現在のユーザーに属さないというエラーになります。
- **会签（全員承認）の却下時は残りのインスタンスを早めに終了させる**：completionCondition に REJECT 判定を含める＋リスナーで残りの task を delete します。さもないと却下後も他の人に承認待ちが届き続けます。
- **勤怠との連動はフロー終了リスナーに書く**こと。特定の承認ボタン API に書くのではなく、PC、H5、カードコールバックのどの入口でも有効にし、かつ承認が実際に通っていない限り勤怠を誤って変更しないようにします。

### 10.4 WeCom API のレート制限とその他

| API | 制限（参考。公式ドキュメント優先） |
|-----|------|
| gettoken | 同一企業の5分以内の呼び出し回数に制限あり、必ずキャッシュする |
| メッセージ送信 | アプリごとに1分あたりの上限あり、touser はできるだけまとめて重複排除する |
| アドレス帳読み取り | 1日あたりの総回数に上限あり、増分コールバックを中心にする |
| メッセージカード更新 | インターフェースのレート制限を受ける、ループ更新を避ける |

その他よくある問題：

- **サーバーの出口 IP を「企業信頼 IP」ホワイトリストに追加する**こと。さもないと `60020` になります。
- **HTTPS＋ICP 登録が必須**（中国大陸のサーバー）。証明書が切れるとアプリ全体が開けなくなる上に分かりやすい警告も出ないため、監視に組み込んでください。
- **コールバックは秒単位で `success` を返す必要がある**。業務処理は非同期化し、さもないと WeCom の再プッシュで重複承認が起きます（冪等でフォールバック）。
- **textcard の url は詳細ページに直接着地させるのが推奨**。シングルサインオン（免登）＋state でのリダイレクト戻りと組み合わせ、「通知をタップして承認へ直行」を実現します。
- **secret 漏洩時**は直ちに管理画面でリセットし、サービスを再起動します。コードレビューでは「フロントエンド/ログに secret が現れる」ことをレッドラインとして扱います。

### 10.5 ネットワーク分離と中継ゲートウェイ関連

- **内网システムは絶対に公網に直接公開しない**：DMZ にゲートウェイを置くだけにし、境界ファイアウォールは「ゲートウェイ IP → 内网勤怠サービス IP:ポート」のホワイトリスト1件だけを許可し、ゲートウェイからデータベース/Redis のポートは一切開かない。
- **secret と業務 DB を置く側を分ける**：WeCom の secret、EncodingAESKey はゲートウェイだけに置く；アカウントバインド、JWT、業務データは内网だけに置く。どちらの側にも、鍵の保持と業務 DB 接続を両立させない。
- **内部インターフェース `/internal/**` は二重保護が必須**：mTLS クライアント証明書＋内部トークン（短い有効期限、ローテーション可能、定数時間比較）とし、公網 Nginx のリバースプロキシ location には決して現れないようにし、同時にタイムスタンプ/nonce でリプレイを防止する。
- **内部 JWT を URL の query に長期間置かない**：Nginx/ゲートウェイのログやブラウザの履歴に残ります。使い捨ての中継ページで hash（`#` 部分はサーバーログに残らない）を読んで localStorage に書き込んだら、すぐに消去する。
- **コールバックはゲートウェイが先に success を返し、内网が非同期・冪等に処理する**：ゲートウェイは署名検証・復号後に内网へ転送し、自身は秒で応答する；内网はイベント id で冪等性を保ち、ゲートウェイのリトライを許容する。
- **リバーストンネルで管理ポートを素のまま公開しない**：内网から能動的に張る WireGuard/mTLS トンネルで狭いインターフェースだけを運ぶ；素の frp で内网の 8080/管理画面を直接公網にマッピングすることを禁止する。
- **証明書と到達性は別々に検証する**：WeCom の信頼ドメイン/HTTPS 証明書はゲートウェイの公開ドメインに設定する；内网は自己署名または内部 CA 証明書で mTLS ができればよく、公開証明書は不要。実機の外勤ネットワーク（4G/5G）で必ずシングルサインオン（免登）とコールバックを一度リグレッション確認する。

## 11. リリース前チェックリスト

**WeCom 管理画面**

- [ ] 自建アプリの可視範囲がすべての利用者の部門をカバーしている
- [ ] アプリのホームページが H5 モバイルアドレス（https）として設定されている
- [ ] 信頼ドメインが設定済みで、所有権確認ファイルにアクセスできる
- [ ] 企業信頼 IP がホワイトリストに追加済み（サービスの出口 IP）
- [ ] メッセージ受信 URL/Token/EncodingAESKey が設定済みで GET 検証を通過している

**アカウントと身份**

- [ ] `sys_user.wecom_user_id` がアドレス帳同期で初期化済みで、社員番号のマッピングが正しい
- [ ] 未マッチのアカウントに「管理者に連絡/セルフバインド」の明確な誘導があり、黙ってアカウントを作らない
- [ ] `snsapi_base` の暗黙的シングルサインオン（免登）が実機（iOS＋Android）で検証通過している
- [ ] token 失効後の再シングルサインオンがシームレスで、元のページ（承認詳細のディープリンクを含む）に正しくリダイレクトで戻る

**機能**

- [ ] JS-SDK の `wx.config` が iOS/Android の両端で通過する（特に署名 URL を重点確認）
- [ ] 測位/撮影/スキャンが実機で使え、バックエンドの距離二次チェックが機能する
- [ ] 会签（全員承認）：各人に独立した承認待ちがあり、1人でも却下したら終了して起票者に通知される
- [ ] 或签（いずれか1名が承認）：候補者全員に届き、1人が claim して処理した後は他の人の承認待ちが消える
- [ ] 組織構造に基づく承認：申請者の部門に従って責任者/分管役員へ正しくルーティングされる
- [ ] 承認通過後の勤怠連動（打刻補正（補カード）の修正/休暇残日数の減算）が正しく DB に反映される
- [ ] 承認待ちカードのプッシュが届き、タップでログイン済みのまま直行できる；カードボタンのコールバックが冪等である

**セキュリティと運用**

- [ ] secret/Token/AESKey が環境変数経由で、Git に入っておらずログにも現れていない
- [ ] access_token/jsapi_ticket のキャッシュ＋分散ロックを検証済み（複数インスタンス）
- [ ] HTTPS 証明書の有効期限監視、API のレート制限、主要操作の監査ログがある
- [ ] アドレス帳の増分コールバック＋毎日の全量フォールバックタスクが有効化済み

**ネットワーク分離 / 公開中継ゲートウェイ（第9章、分離ネットワークでは必須確認）**

- [ ] DMZ ゲートウェイが唯一の公開面で、内网の勤怠システムには公網からのインバウンドルールが一切ない
- [ ] 境界ファイアウォールは「ゲートウェイ IP → 内网勤怠 IP:8080」だけを許可し、PG/Redis のポートは開いていない
- [ ] WeCom の secret / EncodingAESKey はゲートウェイだけにあり内网は保持していない；ゲートウェイは業務 DB に接続しない
- [ ] `/internal/**` が mTLS＋内部トークン＋タイムスタンプ/nonce のリプレイ防止を通り、公網 Nginx でリバースプロキシされていない
- [ ] シングルサインオンのゾーン横断経路を実機検証：ゲートウェイが userid に交換 → 内网が assert して JWT に交換 → 業務 API に認証が透過される
- [ ] コールバック：ゲートウェイが署名検証・復号して秒で success を返し、内网が非同期・冪等に処理；承認待ちがゲートウェイ経由で代理送信され届く
- [ ] 外勤 4G/5G の実機リグレッション：H5 の読み込み、シングルサインオン、位置情報打刻、承認待ちとカードコールバック
- [ ] リバーストンネルを使う場合：内网から能動的に発信、WireGuard/mTLS、狭いインターフェースだけを公開、素の frp の管理ポートなし

## まとめ

「既存の勤怠システム＋Activiti による複雑な承認」を前提に企業微信（WeCom）を統合するとき、正しい考え方は一から作り直すことではなく、WeCom を**入口・身份プロバイダ・メッセージチャネル**として位置づけることです。

- **方式選定**：既存の Web システムがあり、承認フォームが複雑で、迅速なイテレーションと審査不要のリリースが求められる場合、ミニプログラムより H5 が適しています。OAuth2 の `snsapi_base` 暗黙的認可だけでアプリを開いた際の自動ログイン（免登）を実現でき、JS-SDK が測位、撮影、スキャンを十分にカバーします。
- **自動ログインの経路**：フロントのルートガードが token なしを検知 → WeCom 認可へ 302（state 付き）→ code 付きでシームレスにリダイレクトで戻る → バックエンドが gettoken＋`auth/getuserinfo` で userid を取得 → **社員番号で既存システムのアカウントにマッピング（新規作成ではなく）** → システム従来の JWT を発行し、以降のすべての勤怠・承認 API を無改造で再利用する。
- **アカウントの分離**：Activiti の assignee/候補者は内部 username を使い続け、WeCom の userid は `sys_user` 上の外部身份フィールドにとどめ、ログイン時の本人確認とプッシュの宛先解決のときだけ変換して、複数のログイン方式が併存できる能力を残します。
- **承認の再利用**：会签（全員承認）（マルチインスタンス＋完了条件）、或签（いずれか1名が承認）（candidateUsers＋claim）、組織構造に基づく承認（UEL 式で責任者を動的解決）はすべて既存の BPMN をそのまま使います。H5 は承認待ち一覧/詳細/処理の入口を新設するだけで、下位層はすべて同じ `taskService.complete()` を通ります。
- **連動とリーチ**：勤怠連動はフロー終了リスナーに置いて各入口での一貫性を保証する；新しい承認待ちは textcard でプッシュし、リンクは承認詳細に直行してシングルサインオンを再利用する；カード内のワンクリック承認はコールバックで処理し、操作は必ず冪等にする。
- **最重要のハマりどころ**：信頼ドメインと企業信頼 IP、iOS/Android の署名 URL の違い、code の使い捨てと state による CSRF 防止、重複アカウントの絶対禁止、或签の claim、コールバックでの秒時 success、チケットの集中キャッシュ。
- **ネットワーク分離の実装**：勤怠システムが内网にあり WeCom から到達できない場合、DMZ に公開中継ゲートウェイを唯一の公開面として配置します。WeCom の鍵とクラウド呼び出し（gettoken/getuserinfo/署名/メッセージ代理送信/コールバック署名検証）をゲートウェイに集約し、アカウントバインド、JWT、Activiti、業務データはすべて内网に残し、両者を mTLS＋内部トークンの狭いインターフェース（`/internal/**`）で制御された形で相互接続します。DMZ→内网のインバウンドすら許可されない場合は、次善策として内网から能動的に張る WireGuard/mTLS のリバーストンネルを使います。これにより WeCom の入口を開通させつつ、内网システムを公網に直接公開しないようにします。

公式ドキュメント：[企業微信デベロッパーセンター](https://developer.work.weixin.qq.com/document/)

> この方案の本質は「作り直し」ではなく「統合」です。最小限の新規コード（OAuth ログインエンドポイント1つ、アカウントマッピング1層、JS-SDK 署名サービス1つ、承認待ちプッシュリスナー一式）で、長年蓄積してきた勤怠と Activiti の承認機能を従業員の企業微信（WeCom）の中にシームレスに届け、シームレスな自動ログイン（免登）を実現します。将来、打刻体験のさらなる向上が必要になれば、ミニプログラムの打刻入口を追加し、H5 の承認と同じバックエンドのアカウントとワークフローを共有することで、滑らかに進化できます。
