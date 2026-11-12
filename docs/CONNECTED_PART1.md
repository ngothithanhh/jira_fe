# Phần 1 — Phiên đăng nhập và kết nối backend thật

Ngày 12/11/2026. Phạm vi: đăng ký, đăng nhập, context tài khoản/quyền, danh sách dự án chỉ đọc, refresh và logout. Issue/backlog/board cùng các màn còn lại tiếp tục ở phần sau, không phải đã nối toàn bộ 19 nhóm chức năng.

## Đường chạy

Browser `/app` → `/api/backend` cùng origin → Spring Boot `/api` → PostgreSQL demo riêng. Component dùng bộ trình bày `project-ui`; không dùng DemoProvider/fixture và không fallback dữ liệu mẫu khi API lỗi. `/ui-review` vẫn để đối chiếu thiết kế trong development.

| API từ browser | API Spring Boot | Điều kiện/kết quả |
|---|---|---|
| POST `/api/backend/auth/login` | POST `/api/auth/login` | Email/password; thành công trả authenticated, token chỉ vào HttpOnly cookie. |
| POST `/api/backend/auth/register` | POST `/api/auth/register` | userName/fullName/email/password; không nhận role từ browser; email trùng 409. |
| GET `/api/backend/auth/me` | GET `/api/auth/me` | Probe phiên trước refresh để tab sau không rotation lặp. |
| POST `/api/backend/auth/refresh` | POST `/api/auth/refresh` | Refresh token lấy từ cookie server, không từ body browser; không gửi Bearer cũ. |
| POST `/api/backend/auth/logout` | POST `/api/auth/logout` | Revoke family; xóa cookie local. Phân biệt lỗi browser→Next và Next→BE. |
| GET `/api/backend/account/context[?projectId=N]` | GET `/api/account/context[?projectId=N]` | Chỉ tài khoản JWT hiện tại; quyền toàn cục tách quyền project; 400/401/403/404 đúng phạm vi. |
| GET `/api/backend/projects/getList` | GET `/api/projects/getList` | Chỉ dự án người gọi được VIEW_PROJECT; tìm kiếm cục bộ trên danh sách API hiện có. |

API khác chưa trong allowlist trả 404. Context quyền dùng để hiển thị UI; backend vẫn kiểm lại ở mọi API nghiệp vụ. IssueResponse đã bổ sung statusId/issueTypeId nullable, giữ nguyên tên/trường cũ cho đợt nối issue.

## Phiên và lỗi

- Access/refresh cookie HttpOnly, host-only, SameSite=Lax; Secure ở production. Access có path `/api/backend`, refresh có path `/api/backend/auth`; clear dùng đúng path. Credential không xuất hiện trong response JSON, localStorage hay BroadcastChannel.
- Trong production dùng HTTPS và đặt APP_ORIGIN thành public origin chính xác. Localhost/loopback dùng để kiểm cục bộ; không dùng HTTP công khai cho cookie Secure.
- Chỉ public auth nhận POST từ Origin tin cậy. Cấu hình APP_ORIGIN được ưu tiên; fallback local kiểm protocol/Host, không tin Origin tự khai hoặc X-Forwarded-Host bất kỳ.
- Request 401 có tối đa một lần khôi phục. Web Locks phối hợp giữa tab, promise gom trong tab; tab giữ khóa probe `/me` trước rotation. Browser không hỗ trợ Web Locks phải đăng nhập lại khi access hết hạn, không tự tranh refresh token.
- Không tự retry mutation khi timeout/5xx/409. 403 không xóa phiên. Lỗi mạng hiện thông báo và nút thử lại, không đổi thành empty state.
- Khi đổi tài khoản, UI chặn hiển thị hồ sơ cũ, hủy query cũ, xóa cache dữ liệu và reset context trước khi dựng người dùng mới. Sự kiện có source để tab gửi không xử lý hai lần.
- Logout ghi **cờ ý định thoát không chứa credential** trong localStorage trước request. Chỉ xóa cờ khi Next xác nhận đã clear cookie bằng header X-Jira-Session-Cleared. Nếu browser chưa tới được Next, reload/online chỉ thử hoàn tất logout và không khôi phục danh tính cũ.
- Lỗi Next→BE: Next vẫn xóa cookie, trả thông báo chưa xác nhận revoke BE. Không tuyên bố server đã thu hồi khi chưa có xác nhận. Không có bảo đảm exactly-once hoặc realtime push.

## Cấu hình và chạy

FE dùng Node hiện có, `npm install` nếu chưa có dependencies:

```powershell
$env:BACKEND_API_URL='http://127.0.0.1:8080/api'
npm run dev -- --hostname 127.0.0.1 --port 3127
```

BACKEND_API_URL chỉ được đọc trên server, không có NEXT_PUBLIC. Nếu đặt APP_ORIGIN, phải khớp origin browser (bao gồm port). Không commit file .env.local hoặc credential.

Build riêng để không đè cache preview:

```powershell
$env:NEXT_DIST_DIR='.next-connected-build'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3130
```

Backend dùng JDK17 và DB đã migrate, `spring.jpa.hibernate.ddl-auto=validate`; xem `work/jira/docs/RUN_AND_MIGRATE.md`. Không copy JAR chứa cấu hình cá nhân lên Git hoặc chia sẻ ngoài máy.

## Dữ liệu được chuẩn bị ở phần này

- DB `jira_demo_ready` trên PostgreSQL local, tách khỏi DB `jira` hiện có.
- Ba project: SHOP — Website thương mại điện tử; CARE — Ứng dụng chăm sóc khách hàng; PORTAL — Cổng thông tin nội bộ.
- PM được xem cả ba; developer chỉ SHOP/CARE; outsider không có project. Thành viên, tài khoản và notification tạo qua API thật.
- Credential demo chỉ nằm ở `outputs/backend-integration/credentials.local.json` ngoài hai repo; không commit. Các tài khoản dùng địa chỉ example.test, không phải người dùng thật.
- Dữ liệu issue/sprint/lịch sử 90 issue trong plan chưa seed ở phần này. Empty state của người vừa đăng ký là đúng, không tự cấp quyền hay tạo số liệu.

## Luồng kiểm tra bằng tay

1. Mở `/app/projects` trong cửa sổ chưa đăng nhập: phải về `/app/sign-in`, chưa thấy danh sách.
2. Dùng email persona PM trong file credential; thử sai mật khẩu, xem lỗi và email còn giữ. Nhập đúng password: vào danh sách ba project.
3. Tìm SHOP/CARE theo mã/tên, xóa từ khóa để thấy đủ danh sách. Màn này hiện chỉ đọc, chưa mở chi tiết/tạo/sửa project.
4. Vào Tài khoản: kiểm đúng tên/email PM. F5 và đóng/mở lại tab vẫn giữ phiên.
5. Mở hai tab trong cùng browser profile; đăng xuất một tab, tab kia phải về đăng nhập. F5 không tự đăng nhập lại.
6. Đăng nhập developer: chỉ hai project SHOP/CARE, không có PORTAL. Đăng nhập outsider: hiện chưa có dự án, không thấy cache của người trước.
7. Đăng ký email mới: vào ứng dụng với phạm vi rỗng, F5 rồi logout/login lại vẫn đúng tài khoản. Đăng ký lại email đã dùng phải báo trùng.

## Kiểm thử tự động

```powershell
npx tsc --noEmit
npm run test:connected
npm run test:planning
npm run test:ui-demo
```

`tests/connected-server.test.mjs` kiểm transport BFF với fetch giả để chủ động lỗi; không phải bằng chứng DB thật. Backend có AccountContextRegressionTest, MapperRegressionTest và test đăng ký trùng cập nhật.

`tests/connected-browser.smoke.cjs` chạy Chromium với BE/DB thật. Cần Playwright (package đã cài hoặc PLAYWRIGHT_MODULE trỏ bundle), CONNECTED_CREDENTIALS trỏ JSON local, CONNECTED_URL (mặc định loopback:3130), CONNECTED_OUTPUT là thư mục ảnh/kết quả; có thể đặt CHROMIUM_PATH nếu dùng browser đã cài. Script chỉ dùng database demo được chuẩn bị riêng; test đăng ký tạo một tài khoản giả lập mới.

Ảnh/kết quả và giới hạn cuối cùng được ghi ở `outputs/backend-integration/part1`; xem báo cáo bàn giao cùng thư mục. Không tính test unit/BFF mock là đã kiểm browser hoặc đồng thời DB.
