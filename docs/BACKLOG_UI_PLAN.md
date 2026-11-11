# Đợt UI 1: Backlog và lập kế hoạch sprint

Người dùng yêu cầu chạy repo tham khảo, tích hợp từng phần, kiểm tra/commit rồi mở bản chạy và hỏi duyệt. Đợt này chỉ làm phần Backlog, dừng chờ phản hồi sau khi hiển thị. Không sửa backend đang được triển khai ở chat chính.

## Nguồn tham khảo

- sanidhyy/jira-clone: component shadcn/Radix, Tailwind và TanStack Query cùng nền FE hiện tại. Bản clone: work/ui-references/sanidhyy-jira-clone. Không chép API/auth Appwrite.
- oldboyxx/jira_clone, commit 26a9e77: đọc Sidebar, Board/Lists/List/Issue và Board/IssueDetails; tham khảo phân cấp chữ, nền trung tính và panel chi tiết. Viết lại bằng TypeScript/Tailwind/Radix hiện có, không đưa React 16/styled-components/Webpack 4 vào FE.
- Jira Scrum template: bố cục sprint + backlog có nhóm thu gọn. Chỉ tham khảo giao diện công khai, không lấy logo hoặc mã độc quyền.

## Luồng triển khai

1. `/ui-review/backlog` là trang phát triển dùng fixture có nhãn rõ, không gọi API hoặc ghi DB. Dùng chung BacklogView với trang thật để người dùng duyệt được cả tìm kiếm, lọc, modal, panel và sắp xếp. Trang bị tắt ở production.
2. `/projects/{projectId}/backlog` kiểm đăng nhập bằng luồng hiện có, rồi tải project, sprint mở và backlog. projectId là projects.project_id; sprintId là sprints.sprint_id; issue.id là issues.issue_id, không phải issue_number. Lỗi tải hiển thị thông báo và nút thử lại; không thay bằng fixture.
3. Controller FE đọc `/projects/{id}`, `/projects/{id}/backlog`, `/sprints/project/{id}` và `/sprints/{id}/issues`; chỉ lấy FUTURE/ACTIVE để lập kế hoạch. DTO backend được chuyển sang model giao diện tại một nơi, giữ ID nullable, version và storyPoints.
4. GET `/projects/{id}/issue-types` cấp lựa chọn loại cho tạo issue; không tự dùng ID 1. Tạo issue gửi summary, projectId, issueTypeId và priority; backend quyết định trạng thái đầu. Tạo sprint gửi tên/mục tiêu/ngày. Thiếu cấu hình loại thì không cho gửi tạo issue và hiển thị lý do.
5. Kéo trong nhóm gửi toàn bộ issueIds theo thứ tự tới API `/order` tương ứng. Có bộ lọc thì tắt reorder để không gửi danh sách thiếu. Chỉ chuyển trực tiếp product → sprint (POST link) hoặc sprint → product (DELETE link); chuyển giữa hai sprint cần đưa về backlog trước, tránh chuỗi hai request lưu dở. FE không tự viết transaction bù.
6. Mutation khóa tương tác trong lúc chờ, cập nhật danh sách ngay và rollback khi lỗi; 409 yêu cầu tải lại. Mọi mutation refetch để lấy trạng thái/rank backend đã chốt. Không tự retry mutation.
7. Start/complete dùng API sprint hiện có; hoàn tất cho chọn trả việc chưa xong về product hoặc chuyển sang sprint FUTURE. Panel chi tiết sửa mô tả/storyPoints qua API update issue; status hiển thị, không tự đổi workflow ở đợt này.
8. Tự kiểm tra desktop/mobile, tìm kiếm, thu gọn nhóm, modal tạo, panel, thao tác sắp xếp, build/typecheck và nhánh lỗi HTTP. Chỉ commit file FE của đợt này; không push. Mở tab localhost và hỏi người dùng duyệt/chỉnh sửa sau commit.
