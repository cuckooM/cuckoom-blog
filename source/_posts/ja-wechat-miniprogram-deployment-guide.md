---
title: "WeChatミニプログラムの完全デプロイガイド：サーバー構築から公開まで"
date: 2026-06-22 10:00:00
tags:
  - WeChatミニプログラム
  - デプロイ
  - SpringBoot
  - PostgreSQL
  - Nginx
categories:
  - 技術チュートリアル
lang: ja
---

WeChatミニプログラムの開発後、どのようにデプロイして公開するかは多くの開発者が直面する最初の課題です。本記事では、典型的なWeChatミニプログラムプロジェクト（フロントエンド + SpringBoot バックエンド + PostgreSQL データベース）のサーバー環境準備から最終公開までの完全な手順を詳しく解説します。

## プロジェクトアーキテクチャ

本記事では `miniprogram-demo` プロジェクトを例に、プロジェクト構造は以下の通りです：

```
miniprogram-demo/
├── miniprogram/        # WeChatミニプログラム フロントエンド
│   ├── app.js          # アプリエントリーポイント
│   ├── app.json        # アプリ設定
│   ├── pages/          # ページディレクトリ
│   └── utils/          # ユーティリティ
├── backend/            # SpringBoot バックエンド
│   ├── src/
│   └── pom.xml
└── docs/
    └── sql/            # データベース初期化スクリプト
```

**技術スタック**：
- フロントエンド：WeChatミニプログラム ネイティブ開発
- バックエンド：SpringBoot 2.7 + MyBatis-Plus
- データベース：PostgreSQL
- デプロイ：Nginx + HTTPS

## 第1部：サーバー環境準備

### 1. サーバー構成の確認

WeChatミニプログラムのデプロイには以下の環境が必要です：
- **Java 11+**（JDK 17推奨）
- **PostgreSQL 12+**
- **Nginx**（リバースプロキシおよびHTTPS用）
- **ICP登録済みのドメイン**（WeChatの必須要件）

インストール済みコンポーネントの確認：
```bash
java -version
psql --version
nginx -v
```

### 2. 不足コンポーネントのインストール

**Ubuntu/Debian システム**：
```bash
sudo apt update
sudo apt install openjdk-17-jdk postgresql nginx -y
```

**CentOS/RHEL システム**：
```bash
sudo yum install java-17-openjdk postgresql-server nginx -y
```

## 第2部：データベース初期化

### 3. データベースとユーザーの作成

PostgreSQLにログイン：
```bash
sudo -u postgres psql
```

以下のSQLコマンドを実行：
```sql
CREATE USER demo WITH PASSWORD 'your_secure_password';
CREATE DATABASE demo_db OWNER demo;
GRANT ALL PRIVILEGES ON DATABASE demo_db TO demo;
\q
```

### 4. データベーステーブル構造の初期化

プロジェクトはLiquibaseを使用してデータベースバージョン管理を行っています。アプリケーション起動時に自動的にテーブルが作成されます。手動初期化が必要な場合：

```bash
psql -U demo -d demo_db -f docs/sql/init.sql
```

## 第3部：バックエンドデプロイ

### 5. 本番環境設定

**重要**：本番環境の設定ファイルはGitにコミットしないでください。機密情報の漏洩を防ぎます。

サーバーに設定ディレクトリを作成：
```bash
mkdir -p /opt/demo/config
```

本番環境設定ファイル `/opt/demo/config/application.yml` を作成：

```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/demo_db
    username: demo
    password: your_actual_password
    driver-class-name: org.postgresql.Driver

wechat:
  appid: your_appid
  secret: your_appsecret
  code2session-url: https://api.weixin.qq.com/sns/jscode2session

jwt:
  secret: your_complex_random_secret_key
  expiration: 604800000

logging:
  level:
    com.checkin: info
```

### 6. JARパッケージのビルド

```bash
cd ~/work/code/miniprogram-demo/backend
mvn clean package -DskipTests
```

ビルド成果物：`backend/target/miniprogram-demo-1.0.0-SNAPSHOT.jar`

### 7. サーバーへのアップロード

```bash
scp backend/target/miniprogram-demo-1.0.0-SNAPSHOT.jar user@server:/opt/demo/
scp /opt/demo/config/application.yml user@server:/opt/demo/config/
```

### 8. systemdサービスの作成（推奨）

バックエンドサービスの自動起動とクラッシュ時の自動再起動のためにsystemdサービスを作成します：

```bash
sudo vim /etc/systemd/system/demo.service
```

以下の内容を書き込み：
```ini
[Unit]
Description=Demo Backend Service
After=postgresql.service

[Service]
User=your_user
WorkingDirectory=/opt/demo
ExecStart=/usr/bin/java -jar /opt/demo/miniprogram-demo-1.0.0-SNAPSHOT.jar --spring.config.location=/opt/demo/config/application.yml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

サービスの起動：
```bash
sudo systemctl daemon-reload
sudo systemctl enable demo          # 自動起動有効化
sudo systemctl start demo           # サービス開始
sudo systemctl status demo          # 状態確認
```

## 第4部：HTTPS設定

WeChatミニプログラムはバックエンドインターフェースにHTTPSを強制要求します。

### 9. SSL証明書の取得

**方法1：Let's Encryptを使用（無料、推奨）**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 10. Nginxリバースプロキシの設定

```bash
sudo vim /etc/nginx/sites-available/demo
```

以下の内容を書き込み：
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

設定を有効化してNginxをリロード：
```bash
sudo ln -s /etc/nginx/sites-available/demo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 第5部：WeChatミニプログラム設定

### 12. ミニプログラムのバックエンドアドレス変更

`miniprogram/app.js`を編集し、`baseUrl`を本番環境のドメインに変更：

```javascript
globalData: {
  baseUrl: 'https://your-domain.com',  // HTTPSドメインに変更
  token: '',
  userInfo: null
}
```

**注意**：ミニプログラムの本番環境では必ずHTTPSを使用する必要があります。

### 13. サーバードメインの設定

[WeChat公式プラットフォーム](https://mp.weixin.qq.com)にログイン：
- **開発管理** → **開発設定** → **サーバーアドレス**
- **リクエスト有効ドメイン**に `https://your-domain.com` を追加

**重要**：
- ドメインは必ずICP登録が完了している必要があります
- ドメインはHTTPSに対応している必要があります

### 14. WeChatミニプログラムのAppIDとSecretの取得

WeChat公式プラットフォームで：
- **開発管理** → **開発設定** → **開発者ID**
- AppIDとAppSecretをコピー

バックエンド設定ファイルに入力：
```yaml
wechat:
  appid: wx1234567890abcdef
  secret: your_appsecret_here
```

バックエンドサービスを再起動：
```bash
sudo systemctl restart demo
```

## 第6部：ミニプログラムの公開

### 15. WeChat開発者ツールでアップロード

1. **WeChat開発者ツール**を開く
2. `miniprogram/` ディレクトリをインポート
3. 正しいAppIDを入力
4. すべての機能をテスト
5. 右上の**アップロード**ボタンをクリック
6. バージョン番号と説明を入力

### 16. レビュー提出と公開

WeChat公式プラットフォームにログイン：
1. **バージョン管理**に入る
2. アップロードした開発バージョンを探す
3. **レビュー提出**をクリック
4. レビュー説明を入力
5. レビュー待ち（通常1〜3営業日）
6. レビュー通過後、**公開**をクリック

## 第7部：検証チェックリスト

公開前に逐项確認：

- [ ] PostgreSQLが正常に動作し、データベースに接続可能
- [ ] バックエンドサービスが正常に起動（`systemctl status demo`）
- [ ] HTTPSでアクセス可能（`curl https://your-domain.com/`）
- [ ] WeChatバックエンドに有効ドメインが設定済み
- [ ] ミニプログラムの`baseUrl`がHTTPSドメインに変更済み
- [ ] AppIDとSecretが正しく入力されている
- [ ] ローカルテストが正常
- [ ] 実機テストが正常
- [ ] ミニプログラムのアップロード、レビュー通過、公開が完了

## よくある質問

### Q1: 実機デバッグで「リクエスト有効ドメインリストにない」エラー

**解決方法**：WeChat公式プラットフォーム → 開発管理 → 開発設定 → サーバーアドレスでドメインを追加してください。

### Q2: バックエンド起動時にデータベース接続失敗

**確認手順**：
1. PostgreSQLの動作確認：`sudo systemctl status postgresql`
2. データベースのユーザー名/パスワードの確認
3. データベースの作成確認：`psql -U postgres -l | grep demo_db`

### Q3: wx.getUserProfileの呼び出しエラー

**原因**：该接口は2022年以降に廃止されました。

**解決方法**：「アバターニックネーム入力コンポーネント」を代わりに使用してください。

### Q4: サーバーメモリ不足（2GB的小型サーバー）

**最適化提案**：
- PostgreSQL + Javaで約800MB〜1.2GBのメモリが必要です
- Swap領域の設定：`sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
- JVMメモリパラメータの設定：`-Xmx512m -Xms256m`

## まとめ

WeChatミニプログラムのデプロイは複数のステップを含みます：サーバー環境構築、データベース設定、バックエンドデプロイ、HTTPS設定、ミニプログラム設定、そして最終公開。全体の流れは複雑に見えますが、手順を一つずつ着実に進めればスムーズに公開できます。

**重要ポイント**：
1. ドメインは必ずICP登録が完了し、HTTPSに対応している必要があります
2. 本番環境設定はGitにコミットせず、独立して管理してください
3. systemdを使用してサービスを管理すると、自動起動とクラッシュ時の再起動が可能です
4. ミニプログラムの公開前には必ず実機テストを十分に行ってください
5. SSL証明書は定期的に更新し、サービスの安定性を確保してください
