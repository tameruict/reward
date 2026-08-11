# Microsoft Rewards Script - Replit deployment

Thư mục này là bản đóng gói riêng để chạy worker headless trên Replit. Không
đưa `.env`, `config.json`, `data/`, `sessions/` hoặc file tài khoản từ máy local
lên Replit.

## 1. Đưa lên Replit

Upload toàn bộ nội dung của thư mục `replit-deploy` vào một Repl mới. Replit
cần Node.js 24 trở lên vì project sử dụng `node:sqlite`.

Lệnh chạy local/Preview:

```bash
npm run replit:start
```

### Browser trên Replit

Replit không cho dùng `sudo apt-get` hoặc `npx playwright install-deps`. Gói này
đã khai báo Chromium runtime trong `replit.nix` và chỉ dùng Chromium của
Patchright. Không chạy `npx playwright install` (lệnh đó cố tải thêm Firefox và
WebKit); nếu cần cài browser thủ công, dùng:

```bash
npx patchright install chromium
```

Runtime đặt `PLAYWRIGHT_BROWSERS_PATH=0` và `FORCE_HEADLESS=1`, nên worker/API
không cần X server.

Lệnh này build TypeScript, cài Chromium của Patchright, tạo `config.json` từ
`config.example.json`, rồi chạy một lượt bot.

## 2. Khai báo Secrets

### Khuyến nghị khi có nhiều account: database mode

Không cần tạo từng `ACCOUNT_N_*` Secret. Chỉ tạo các Secret dùng chung:

```text
ACCOUNTS_SOURCE=database
ACCOUNTS_DB_KEY=chuoi-ma-hoa-dai-64-ky-tu
API_TOKEN=a-long-random-dashboard-token
API_CORS_ORIGIN=*
```

Tạo `ACCOUNTS_DB_KEY` một lần trên máy local hoặc trong Replit Shell:

```bash
npm run accounts -- keygen
```

Sau đó mở dashboard → **Nhập hàng loạt** và gửi một JSON chứa toàn bộ account
và proxy. API mã hóa password/TOTP/proxy password vào `data/accounts.db`; các
Secret account riêng lẻ không còn cần thiết.

Request import tối đa 5 MB. Nếu file lớn hơn, chia thành vài batch; không chạy
worker trong lúc import.

Ví dụ file import:

```json
{
  "proxies": [
    {"label": "proxy-01", "url": "proxy.example.com", "port": 8000,
     "username": "proxy-user", "password": "proxy-password"}
  ],
  "accounts": [
    {"email": "one@example.com", "password": "account-password",
     "totpSecret": "OPTIONAL_TOTP", "proxyLabel": "proxy-01"}
  ]
}
```

Dashboard cũng nhận dạng mỗi dòng theo format:

```text
email | password | recoveryEmail | totpSecret | proxyLabel
```

### Cách cũ: Replit Secrets theo từng account

Chỉ dùng cách này khi có ít account hoặc cần khởi động Replit mà chưa muốn
import database:

Trong Replit Secrets, khai báo tối thiểu:

```text
ACCOUNTS_SOURCE=env
ACCOUNT_1_EMAIL=your-email@example.com
ACCOUNT_1_PASSWORD=your-password
ACCOUNT_1_PROXY_URL=proxy-host
ACCOUNT_1_PROXY_PORT=proxy-port
ACCOUNT_1_PROXY_USERNAME=proxy-user
ACCOUNT_1_PROXY_PASSWORD=proxy-password
ACCOUNT_1_GEO_LOCALE=US
API_TOKEN=a-long-random-dashboard-token
```

Thêm `ACCOUNT_2_*`, `ACCOUNT_3_*`... nếu cần. Mỗi tài khoản phải có proxy hợp
lệ; tool mặc định không cho chạy traffic tài khoản trực tiếp không qua proxy.

Nếu dùng TOTP, thêm `ACCOUNT_1_TOTP_SECRET`. Các thông báo có thể cấu hình bằng
các biến `CONFIG_*` hoặc webhook tương ứng trong README chính.

## 3. Chạy Replit như Control API để dashboard bắn lệnh

Nếu muốn dashboard theo dõi account và chạy riêng từng account, dùng **Reserved
VM** hoặc một deployment luôn online. Replit sẽ chạy Control API tại cổng
`PORT`, còn dashboard gọi qua URL public của Replit.

Các biến bắt buộc:

```text
API_TOKEN=a-long-random-dashboard-token
API_CORS_ORIGIN=*
```

Trong dashboard, mở **Settings VPS**, đặt:

```text
VPS Control API URL: https://<ten-repl-cua-anh>.<replit-domain>
API token: giá trị API_TOKEN ở trên
```

Sau khi kết nối, mỗi account có nút **Chạy**. Nút này gửi `POST /start` với
`{"accountIndex": N}` tới Replit; password, TOTP và proxy credential không đi
qua dashboard. Nút **Chạy tất cả** vẫn gửi `POST /start` không kèm account index.
Replit chỉ trả về metadata an toàn, log và trạng thái worker.

`API_TOKEN` là bắt buộc khi dùng launcher `replit:api`; không để trống vì API
đang lắng nghe trên địa chỉ public.

Lệnh chạy chế độ này là `npm run replit:api` (tự build rồi khởi động API). Nếu
Replit đã có build command riêng và muốn bỏ build lặp lại, dùng
`npm run replit:api:run`.

## 4. Deploy theo lịch

Nếu chỉ cần chạy định kỳ, chọn **Publishing → Scheduled Deployment** rồi dùng:

- Build command: `npm ci --ignore-scripts && npm run build`
- Run command: `node scripts/replit/run-once.js`
- Schedule: chọn giờ chạy và timezone mong muốn

Scheduled Deployment phù hợp vì một lượt bot kết thúc sau khi xử lý xong tài
khoản. Nếu lượt chạy dài hoặc cần API luôn online, dùng Reserved VM thay vì
Scheduled Deployment.

## 5. Dữ liệu phiên và tài khoản

Bản này vẫn dùng SQLite giống tool gốc:

- `data/accounts.db`
- `sessions/sessions.db`

Filesystem của deployment có thể bị thay thế khi publish lại. Vì vậy, để giữ
session giữa các lần deploy cần lưu database/session ở storage hoặc database
bên ngoài và cấu hình `ACCOUNTS_DB_PATH`. Nếu chỉ dùng Secrets cho tài khoản,
hãy chuẩn bị việc đăng nhập lại khi session không còn.

## 6. Lưu ý

- `replit:api` là chế độ dành cho dashboard; `replit:start`/`run-once.js` là
  chế độ chạy một lượt theo lịch.
- Không commit `.env`, password, TOTP, proxy credential hoặc session.
- Replit/datacenter IP có thể khiến Microsoft yêu cầu xác minh thêm; proxy vẫn
  phải là proxy sạch và đúng quốc gia tài khoản.
