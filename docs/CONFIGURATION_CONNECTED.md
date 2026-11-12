# Cấu hình issue type, status và workflow — FE/BE

Plan được chốt tại CONFIGURATION_CONNECTED_PLAN.md. Dữ liệu lấy từ Spring Boot/PostgreSQL local; không dùng fixture để thay kết quả API.

## Phạm vi và quyền

- /app/admin/issue-types, /app/admin/statuses, /app/admin/workflows: chỉ SYSTEM_ADMIN. Các danh mục/quy tắc dùng chung toàn hệ thống.
- /app/projects/{projectId}/settings: tab Thông tin, Loại công việc, Workflow. VIEW_PROJECT được đọc; MANAGE_BOARD hoặc UPDATE_PROJECT được gán/gỡ/chọn loại mặc định. Backend áp dụng quyền lead/admin hiện có.
- Workflow trong project chỉ đọc. Quản trị viên có đường dẫn tới màn quản trị chung, không có workflow riêng cho project.

## Luồng kiểm tra

1. Đăng nhập admin → Cấu hình hệ thống → thêm/sửa tên loại công việc. Tên 1–50 ký tự sau trim; trùng tên409.
2. Trạng thái → thêm tên và nhóm Chưa làm/Đang làm/Hoàn thành. Mở Sửa: chỉ đổi tên; nhóm chỉ đọc. PUT khác nhóm409, giữ nguyên dữ liệu cũ.
3. Workflow → chọn nguồn và đích khác nhau → lưu quy tắc. Xóa cạnh có xác nhận. Các thao tác không tự đổi trạng thái issue.
4. Đăng nhập PM → project → Cài đặt → Loại công việc → gán loại từ danh mục → đặt mặc định → F5. Tạo công việc tại tab Công việc: chọn sẵn đúng loại mặc định, kể cả khi loại này không đứng đầu.
5. Gỡ loại mặc định bị khóa; đặt loại khác làm mặc định trước. Gỡ loại có issue sử dụng409. Xóa danh mục đang có project/issue/mapping/rule/lịch sử409; không tự xóa liên kết.
6. Thành viên chỉ có VIEW_PROJECT được xem cấu hình, không có nút ghi. PM mở trực tiếp URL admin bị từ chối.
7. Mất kết nối hoặc chưa xác nhận được kết quả sau ghi: giữ form, khóa gửi tiếp và yêu cầu tải lại. Không tự replay mutation. Lỗi gate có retry trong modal, giữ bản nháp.

## Hợp đồng và cache

BFF chỉ cho phép endpoint/body/query được liệt kê trong configuration/contract.ts; kiểm Origin và cookie trước chuyển tiếp. Không nhận actor/role/màu/icon/mô tả không được API hỗ trợ.

Backend hiện trả boolean project type dưới tên default. projectTypeFrom chuẩn hóa thành isDefault cho cả settings và issue picker; không đổi hợp đồng BE cũ.

Query key chứa actor và project. Mutation dùng khóa phiên chung, probe actor trước dispatch và sau commit; đổi tài khoản không đưa phản hồi vào form/cache người khác. Global mutation làm stale danh mục, references, issue, planning, board, transitions và reports của actor; project mutation chỉ tác động project tương ứng. Refetch chỉ bắt đầu trong completion đã kiểm actor. Query inactive vẫn stale; lỗi cũ của màn đã đóng không khóa lượt lưu mới.

## Kiểm thử

- npm run test:connected: bao gồm hợp đồng cấu hình, BFF và hai case hook thực tế với QueryClient: cookie đổi actor và lỗi query inactive.
- npm run test:configuration:browser: đặt CONFIG_CREDENTIALS tới JSON local có origin,api,projectId,type,task,todo,admin,pm,viewer,outsider. Mỗi tài khoản cần email/password; credential không commit.
- PLAYWRIGHT_MODULE và CHROMIUM_PATH cho phép dùng runtime Chromium có sẵn; CONFIG_OUTPUT chỉ định thư mục bằng chứng.
- Fixture phải là project/catalog thử riêng, không dùng SHOP. Browser test chỉ dọn issue có tiền tố E2ECFG trong project fixture, rồi giữ cấu hình demo để kiểm bằng tay.
