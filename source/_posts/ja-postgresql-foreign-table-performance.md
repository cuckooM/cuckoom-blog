---
title: PostgreSQL Foreign Tableパフォーマンス最適化実践
date: 2026-06-05 14:00:00
lang: ja
categories:
  - データベース
tags:
  - PostgreSQL
  - Foreign Table
  - FDW
  - パフォーマンス最適化
---

PostgreSQLのForeign Tableは強力な機能で、ローカルテーブルのようにリモートデータソースを操作できます。しかし、実際の使用では、特にLEFT JOINでForeign Tableの主キーを関連する場合、パフォーマンス問題が頭痛の種になります。本記事ではForeign Tableの原理を深く分析し、体系的なパフォーマンス最適化案を提供します。

<!-- more -->

## Foreign Table動作原理

Foreign Tableを最適化するには、まずその動作メカニズムを理解する必要があります。Foreign Tableは**Foreign Data Wrapper (FDW)**アーキテクチャに基づいて実装され、全クエリプロセスはいくつかの段階に分かれます：

### アーキテクチャレベル

```
┌─────────────────────────────────────┐
│  SQLクエリ (SELECT * FROM foreign_tbl) │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  PostgreSQLクエリオプティマイザ         │
│  (クエリプラン生成、条件プッシュダウン)    │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  Foreign Data Wrapper (FDW)         │
│  (postgres_fdw, mysql_fdw, file_fdw)│
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  外部データソース (リモートPG/MySQL/ファイル/API) │
└─────────────────────────────────────┘
```

### 核心コンポーネント

完全なForeign Table設定には3つの核心コンポーネントがあります：

1. **Foreign Server** — 外部データソースの接続情報を定義
2. **User Mapping** — ローカルユーザーからリモートユーザーへの認証マッピング
3. **Foreign Table** — ローカルテーブル構造定義、リモートオブジェクトにマッピング

```sql
-- 1. エクステンション作成
CREATE EXTENSION postgres_fdw;

-- 2. 外部サーバー定義
CREATE SERVER remote_db 
  FOREIGN DATA WRAPPER postgres_fdw 
  OPTIONS (host '192.168.1.100', dbname 'remote', port '5432');

-- 3. ユーザーマッピング
CREATE USER MAPPING FOR current_user 
  SERVER remote_db 
  OPTIONS (user 'remote_user', password 'xxx');

-- 4. 外部テーブル定義
CREATE FOREIGN TABLE foreign_users (
  id int,
  name text,
  status text
) SERVER remote_db 
  OPTIONS (table_name 'users');
```

### クエリ実行フロー

クエリ実行時、PostgreSQLは以下のステップを経ます：

**1. クエリプラン段階**

オプティマイザがクエリがForeign Tableに関連することを識別し、FDWの `PlanForeignScan` コールバック関数を呼び出します。この段階でどのクエリ条件が「プッシュダウン」してリモート実行可能かを決定します。

**2. 条件プッシュダウン（Pushdown）**

これはパフォーマンス最適化の重要ポイントです。WHERE条件がリモートで実行可能なら、ネットワーク転送データ量を大幅に削減できます：

```sql
-- このクエリはWHERE条件をリモートにプッシュダウン
SELECT * FROM foreign_users WHERE id > 100;

-- FDWは以下のようなリモートクエリを生成：
-- SELECT id, name, status FROM users WHERE id > 100
```

現在プッシュダウン可能な内容：
- WHERE条件
- JOIN操作（一部FDWサポート、postgres_fdw 15+サポート）
- 集計関数（SUM, COUNT, AVG等）
- ソートとLIMIT

---

## パフォーマンス最適化戦略

### 1. 条件プッシュダウンを最大限活用

WHERE条件、JOIN、ORDER BYをリモートにプッシュダウンし、ネットワーク転送を削減。

### 2. 必要な列のみ選択

```sql
-- 全列取得（非推奨）
SELECT * FROM foreign_users;

-- 必要な列のみ取得（推奨）
SELECT id, name FROM foreign_users WHERE status = 'active';
```

### 3. FOREIGN SERVER設定最適化

```sql
ALTER SERVER remote_db 
  OPTIONS (ADD fetch_size '10000', ADD use_remote_estimate 'true');
```

---

## 参考資料

- [PostgreSQL Foreign Data Wrapper Documentation](https://www.postgresql.org/docs/current/postgres-fdw.html)