# Cloud Run 에 백엔드 올리기

화면은 Vercel 에, 백엔드는 Cloud Run 에 둔다. 이 문서는 백엔드 쪽만 다룬다.

Cloud Run 을 고른 이유는 무료 구간 안에서 성능을 깎지 않고 돌릴 수 있어서다.
쓰지 않는 동안 인스턴스가 0 으로 내려가고, 그동안에는 요금이 붙지 않는다.
대신 결제 카드는 등록해야 한다. 무료 구간만 써도 마찬가지다.

## 준비

1. Google 계정으로 https://console.cloud.google.com 에 들어가 프로젝트를 만든다.
2. 결제 계정을 만들고 카드를 등록한다. 처음이면 무료 크레딧이 같이 붙는다.
3. gcloud CLI 를 깐다.

   ```
   winget install --id Google.CloudSDK
   ```

4. 로그인하고 프로젝트를 정한다. `<프로젝트ID>` 는 콘솔 위쪽에 보이는 값이다.

   ```
   gcloud auth login
   gcloud config set project <프로젝트ID>
   ```

## 배포

한 번만 켜 주면 되는 것들이다.

```
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

API 키는 Secret Manager 에 넣는다. 배포 명령에 직접 적으면 명령 기록에 남는다.

```
gcloud services enable secretmanager.googleapis.com
gcloud secrets create OPENAI_API_KEY --replication-policy=automatic
gcloud secrets versions add OPENAI_API_KEY --data-file=-
```

마지막 줄을 실행하면 입력을 기다린다. 키를 붙여넣고 엔터, 그다음 Ctrl+Z 를 누르고 엔터를 친다.

Cloud Run 이 그 비밀값을 읽을 수 있게 권한을 준다. `<프로젝트번호>` 는
`gcloud projects describe <프로젝트ID> --format="value(projectNumber)"` 로 확인한다.

```
gcloud secrets add-iam-policy-binding OPENAI_API_KEY --member=serviceAccount:<프로젝트번호>-compute@developer.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

이제 저장소 최상위에서 배포한다. 로컬에 Docker 가 없어도 된다. Cloud Build 가 대신 만든다.

```
gcloud run deploy readyq --source . --region asia-northeast3 --allow-unauthenticated --memory 4Gi --cpu 2 --max-instances 1 --timeout 3600 --no-cpu-throttling --set-secrets OPENAI_API_KEY=OPENAI_API_KEY:latest
```

처음 빌드는 10 분쯤 걸린다. 끝나면 `https://readyq-xxxxxxxx-du.a.run.app` 같은 주소를 준다.

## 왜 이 값들인가

- `--memory 4Gi` — 임베딩 모델과 색인이 3.5GB 안팎을 쓴다. Cloud Run 은 파일 쓰기도
  메모리에서 빼가기 때문에 올린 발표자료 몫까지 더해 잡았다.
- `--max-instances 1` — 준비된 발표가 인스턴스 메모리에 들어 있다. 인스턴스가 둘로 늘면
  업로드는 A 로, 질문은 B 로 가서 "자료가 아직 준비되지 않았습니다" 가 뜬다.
- `--timeout 3600` — WebSocket 연결을 발표 내내 붙잡고 있어야 한다. 기본값 5 분으로는 끊긴다.
- `--no-cpu-throttling` — 색인은 업로드 응답을 보낸 뒤에도 뒤에서 계속 돈다. 기본값은 요청을
  처리하는 동안에만 CPU 를 주기 때문에 그 작업이 멈춘다.
- `--allow-unauthenticated` — 심사위원이 로그인 없이 화면을 열 수 있어야 한다.

## 화면 연결

Vercel 프로젝트의 환경변수를 바꾸고 다시 배포한다.

```
VITE_API_URL = https://readyq-xxxxxxxx-du.a.run.app
VITE_WS_URL  = wss://readyq-xxxxxxxx-du.a.run.app/ws
```

Vite 는 빌드할 때 값을 박아 넣는다. 변수만 바꾸고 재배포하지 않으면 그대로다.

주소를 바꾸지 않고 시험만 해 보려면 화면에서 직접 넣어도 된다.

```
https://<Vercel주소>/?api=https://readyq-xxxxxxxx-du.a.run.app
```

## 알아둘 것

- 올린 발표자료는 인스턴스가 내려가면 사라진다. 한동안 아무도 안 들어오면 내려간다.
  발표 당일에는 시작 전에 한 번 열어서 자료를 올려 둔다.
- 인스턴스가 새로 뜰 때 임베딩 모델을 올리는 데 15 초쯤 걸린다. 모델 파일은 이미지에 들어
  있어서 내려받지는 않는다.
- 무료 구간은 한 달에 vCPU 180,000 초, 메모리 360,000 GiB 초다. 이 설정이면 인스턴스가
  살아 있는 시간으로 25 시간쯤 된다. 넘길 것 같으면 콘솔에서 예산 알림을 걸어 둔다.
- PPTX 는 여전히 올릴 수 없다. 슬라이드 이미지로 바꾸는 데 PowerPoint 를 쓰는데 리눅스에는
  없다. PDF 로 올린다.

## 상태 확인

```
curl https://readyq-xxxxxxxx-du.a.run.app/api/health
```

`빠진_패키지` 가 비어 있고 `이미지_인식_키` 가 openai 면 제대로 올라간 것이다.
로그는 콘솔의 Cloud Run 화면에서 본다.
