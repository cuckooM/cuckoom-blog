---
title: "위챗 미니프로그램 완전 배포 가이드: 서버 구축부터 출시까지"
date: 2026-06-22 10:00:00
tags:
  - 위챗 미니프로그램
  - 배포
  - SpringBoot
  - PostgreSQL
  - Nginx
categories:
  - 기술 튜토리얼
lang: ko
---

위챗 미니프로그램 개발 후 배포하는 방법은 많은 개발자들이 겪는 첫 번째 과제입니다. 이 글에서는 전형적인 위챗 미니프로그램 프로젝트(프론트엔드 + SpringBoot 백엔드 + PostgreSQL 데이터베이스)의 서버 환경 준비부터 최종 출시까지의 완전한 과정을 상세히 설명합니다.

## 프로젝트 아키텍처

이 글에서는 `miniprogram-demo` 프로젝트를 예로 들며, 프로젝트 구조는 다음과 같습니다:

```
miniprogram-demo/
├── miniprogram/        # 위챗 미니프로그램 프론트엔드
│   ├── app.js          # 앱 진입점
│   ├── app.json        # 앱 설정
│   ├── pages/          # 페이지 디렉토리
│   └── utils/          # 유틸리티
├── backend/            # SpringBoot 백엔드
│   ├── src/
│   └── pom.xml
└── docs/
    └── sql/            # 데이터베이스 초기화 스크립트
```

**기술 스택**:
- 프론트엔드: 위챗 미니프로그램 네이티브 개발
- 백엔드: SpringBoot 2.7 + MyBatis-Plus
- 데이터베이스: PostgreSQL
- 배포: Nginx + HTTPS

## 1단계: 서버 환경 준비

### 1. 서버 구성 확인

위챗 미니프로그램 배포에 필요한 환경:
- **Java 11+** (JDK 17 권장)
- **PostgreSQL 12+**
- **Nginx** (리버스 프록시 및 HTTPS용)
- **ICP 등록이 완료된 도메인** (위챗 필수 요구사항)

설치된 컴포넌트 확인:
```bash
java -version
psql --version
nginx -v
```

### 2. 누락된 컴포넌트 설치

**Ubuntu/Debian 시스템**:
```bash
sudo apt update
sudo apt install openjdk-17-jdk postgresql nginx -y
```

**CentOS/RHEL 시스템**:
```bash
sudo yum install java-17-openjdk postgresql-server nginx -y
```

## 2단계: 데이터베이스 초기화

### 3. 데이터베이스 및 사용자 생성

PostgreSQL 로그인:
```bash
sudo -u postgres psql
```

다음 SQL 명령 실행:
```sql
CREATE USER demo WITH PASSWORD 'your_secure_password';
CREATE DATABASE demo_db OWNER demo;
GRANT ALL PRIVILEGES ON DATABASE demo_db TO demo;
\q
```

### 4. 데이터베이스 테이블 구조 초기화

프로젝트는 Liquibase를 사용하여 데이터베이스 버전 관리를 합니다. 애플리케이션 시작 시 자동으로 테이블이 생성됩니다. 수동 초기화가 필요한 경우:

```bash
psql -U demo -d demo_db -f docs/sql/init.sql
```

## 3단계: 백엔드 배포

### 5. 프로덕션 환경 설정

**중요**: 프로덕션 설정 파일은 Git에 제출하지 마세요. 민감 정보 유출을 방지합니다.

서버에 설정 디렉토리 생성:
```bash
mkdir -p /opt/demo/config
```

프로덕션 설정 파일 `/opt/demo/config/application.yml` 생성:

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

### 6. JAR 패키지 빌드

```bash
cd ~/work/code/miniprogram-demo/backend
mvn clean package -DskipTests
```

빌드 결과물: `backend/target/miniprogram-demo-1.0.0-SNAPSHOT.jar`

### 7. 서버에 업로드

```bash
scp backend/target/miniprogram-demo-1.0.0-SNAPSHOT.jar user@server:/opt/demo/
scp /opt/demo/config/application.yml user@server:/opt/demo/config/
```

### 8. 시스템 서비스 생성 (권장)

백엔드 서비스의 자동 시작과 충돌 시 자동 재시작을 위해 systemd 서비스를 생성합니다:

```bash
sudo vim /etc/systemd/system/demo.service
```

다음 내용 작성:
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

서비스 시작:
```bash
sudo systemctl daemon-reload
sudo systemctl enable demo          # 부팅 시 자동 시작
sudo systemctl start demo           # 서비스 시작
sudo systemctl status demo          # 상태 확인
```

## 4단계: HTTPS 설정

위챗 미니프로그램은 백엔드 인터페이스에 HTTPS를 필수로 요구합니다.

### 9. SSL 인증서 신청

**방법 1: Let's Encrypt 사용 (무료, 권장)**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 10. Nginx 리버스 프록시 설정

```bash
sudo vim /etc/nginx/sites-available/demo
```

다음 내용 작성:
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

설정 활성화 및 Nginx 재시작:
```bash
sudo ln -s /etc/nginx/sites-available/demo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 5단계: 위챗 미니프로그램 설정

### 12. 미니프로그램 백엔드 주소 수정

`miniprogram/app.js`를 편집하여 `baseUrl`을 프로덕션 도메인으로 변경:

```javascript
globalData: {
  baseUrl: 'https://your-domain.com',  // HTTPS 도메인으로 변경
  token: '',
  userInfo: null
}
```

**주의**: 미니프로그램 프로덕션 환경에서는 반드시 HTTPS를 사용해야 합니다.

### 13. 서버 도메인 설정

[위챗 공식 플랫폼](https://mp.weixin.qq.com) 로그인:
- **개발 관리** → **개발 설정** → **서버 도메인**
- **request 유효 도메인**에 `https://your-domain.com` 추가

**중요**:
- 도메인은 반드시 ICP 등록이 완료되어야 합니다
- 도메인은 HTTPS를 지원해야 합니다

### 14. 위챗 미니프로그램 AppID 및 Secret 가져오기

위챗 공식 플랫폼에서:
- **개발 관리** → **개발 설정** → **개발자 ID**
- AppID와 AppSecret 복사

백엔드 설정 파일에 입력:
```yaml
wechat:
  appid: wx1234567890abcdef
  secret: your_appsecret_here
```

백엔드 서비스 재시작:
```bash
sudo systemctl restart demo
```

## 6단계: 미니프로그램 출시

### 15. 위챗 개발자 도구로 업로드

1. **위챗 개발자 도구** 열기
2. `miniprogram/` 디렉토리 가져오기
3. 올바른 AppID 입력
4. 모든 기능 테스트
5. 오른쪽 상단 **업로드** 버튼 클릭
6. 버전 번호 및 설명 입력

### 16. 심사 제출 및 출시

위챗 공식 플랫폼 로그인:
1. **버전 관리**进入
2. 방금 업로드한 개발 버전 찾기
3. **심사 제출** 클릭
4. 심사 설명 입력
5. 심사 대기 (보통 1-3 영업일)
6. 심사 통과 후 **출시** 클릭

## 7단계: 검증 체크리스트

출시 전逐项 확인:

- [ ] PostgreSQL 정상 작동, 데이터베이스 연결 가능
- [ ] 백엔드 서비스 정상 시작 (`systemctl status demo`)
- [ ] HTTPS 접근 가능 (`curl https://your-domain.com/`)
- [ ] 위챗 백엔드에 유효 도메인 설정 완료
- [ ] 미니프로그램 `baseUrl`이 HTTPS 도메인으로 변경됨
- [ ] AppID와 Secret이 올바르게 입력됨
- [ ] 로컬 테스트 기능 정상
- [ ] 실기기 테스트 기능 정상
- [ ] 미니프로그램 업로드, 심사 통과, 출시 완료

## 자주 묻는 질문

### Q1: 실기기 디버깅 시 "유효한 request 도메인 목록에 없음" 오류

**해결 방법**: 위챗 공식 플랫폼 → 개발 관리 → 개발 설정 → 서버 도메인에서 도메인을 추가하세요.

### Q2: 백엔드 시작 시 데이터베이스 연결 실패

**확인 단계**:
1. PostgreSQL 작동 확인: `sudo systemctl status postgresql`
2. 데이터베이스 사용자명/비밀번호 확인
3. 데이터베이스 생성 확인: `psql -U postgres -l | grep demo_db`

### Q3: wx.getUserProfile 호출 오류

**원인**: 해당 인터페이스는 2022년 이후 폐기되었습니다.

**해결 방법**: 「아바타 닉네임 입력 컴포넌트」를 대신 사용하세요.

### Q4: 서버 메모리 부족 (2GB 소형 서버)

**최적화 제안**:
- PostgreSQL + Java는 약 800MB-1.2GB 메모리가 필요합니다
- Swap 공간 설정: `sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
- JVM 메모리 매개변수 설정: `-Xmx512m -Xms256m`

## 요약

위챗 미니프로그램 배포는 여러 단계를 포함합니다: 서버 환경 구축, 데이터베이스 설정, 백엔드 배포, HTTPS 설정, 미니프로그램 설정 및 최종 출시. 전체 과정이 복잡해 보이지만 단계를 차근차근 따라하면 원활하게 출시할 수 있습니다.

**핵심要点**:
1. 도메인은 반드시 ICP 등록이 완료되어야 하며 HTTPS를 지원해야 합니다
2. 프로덕션 환경 설정은 Git에 제출하지 말고 독립적으로 관리하세요
3. systemd를 사용하여 서비스를 관리하면 자동 시작과 충돌 재시작이 가능합니다
4. 미니프로그램 출시 전 반드시 실기기 테스트를 충분히 수행하세요
5. SSL 인증서를 정기적으로 갱신하여 서비스 안정성을 확보하세요
