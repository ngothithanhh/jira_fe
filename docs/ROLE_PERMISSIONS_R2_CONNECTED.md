# Giao diện ma trận role/permission R2

## Cách sử dụng

Đăng nhập SYSTEM_ADMIN → Cấu hình hệ thống → Vai trò & quyền (/app/admin/roles).
Giữ shell/header/sidebar và CRUD role R1; phần ma trận permission × role đọc dữ liệu thật.

1. Chọn “Sửa quyền” ở cột role dự án. Chỉ một role được sửa tại một thời điểm.
2. Bật/tắt quyền áp dụng theo membership. SYSTEM_ADMIN chỉ xem và luôn toàn quyền.
3. VIEW_PROJECT luôn có cho thành viên, checkbox hiệu lực không chỉnh; khi Lưu, FE giữ đúng stored VIEW ID cũ thay vì tự tạo grant.
4. Legacy grant không áp dụng hiện cảnh báo và phải xác nhận gỡ trước Lưu. Mở trang/Hủy không tự sửa DB.
5. Lưu gửi một PUT với expected snapshot và desired set. Thay role template ảnh hưởng mọi membership đang dùng role đó ở các project.
6.409 giữ bản nháp, khóa Lưu. Chọn Tải cấu hình mới và xác nhận bỏ thay đổi để lấy base mới; không tự merge hoặc gửi lại.
7. Đổi role/Hủy khi dirty hỏi xác nhận; background refetch không thay base/draft.
8. Đăng nhập user test không phải lead/SYS, F5/focus để kiểm quyền mới trên project được gán; ngoài project vẫn403.

Creator lead+PROJECT_MANAGER, quyền xóa ownership, global role scope và CRUD role cố định giữ R1/P1.
Mã permission cố định là hợp đồng backend, không tạo capability bằng cách thêm tên tùy ý.
API và khóa/seed chi tiết xem docs/ROLE_PERMISSIONS_R2.md trong backend.

## Phiên, lỗi và cache

Matrix query key có actor; đọc qua configurationRead và AbortSignal. Mutation dùng cùng useAdminUserWrite domain admin-roles với CRUD, không dựng transport mới.
Chờ Web Locks xong mới kiểm lại actor/gate; canDispatch không bị chính write.busy làm false.
Sau ghi đánh stale và refetch query của actor khi cookie probe đúng người; completion không ghi snapshot vào actor khác.
“Tải cấu hình mới” cũng probe cookie sau GET trước khi thay draft hoặc xóa lỗi409, không chỉ dựa session event/cache.
Mất response/probe/refetch lỗi: uncertainty latch giữ qua đóng editor/remount/GC, yêu cầu reload xác nhận, không replay tự động.
403/gate mất quyền chặn ghi;503 giữ draft và có retry ma trận/gate. Không coi query inactive lỗi cũ là lỗi của lượt ghi mới.

## Test

Kết quả bàn giao:155 test FE và production build pass;427 unit BE +93 integration PG/HTTP pass. Browser matrix10 nhóm, role/ownership R1 có10 nhóm, users12, configuration15 và8 suite hồi quy pass. Có kiểm cookie thay giữa GET matrix và completion. Review độc lập không còn finding mở.

npm run test:connected có contract/BFF/matrix model và hook actor/latch; test planning/ui-demo giữ hồi quy.
npm run build kiểm production. npm run test:role-matrix:browser dùng:
- MATRIX_CREDENTIALS: file JSON local chứa origin, admin, member, role/otherRole, permissions và projects test.
- MATRIX_OUTPUT: thư mục screenshot/results.
- PLAYWRIGHT_MODULE, CHROMIUM_PATH theo môi trường.

Browser kiểm một PUT khi bấm đôi, quyền hai project và chặn project thứ ba, empty/view,409 giữa hai context, dirty confirmation,503 retry, lost response, queued/late actor, reload actor sau GET, desktop/mobile.
Dùng role/project test riêng, không sửa DEVELOPER/PM trong dữ liệu demo để kiểm. Các suite R1 users/roles/configuration/project/board/backlog/issue/auth/collaboration vẫn cần hồi quy khi ghép.
Chưa có realtime push cho mọi tab; tab member focus/reload mới nhận menu/context mới. API kiểm quyền DB ở request sau.
Không bảo đảm mọi race đã được ép hoặc token/cookie sẽ không đổi ở mọi thời điểm; các guard và test được mô tả đúng phạm vi đã kiểm.
