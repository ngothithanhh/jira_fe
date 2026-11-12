# Việc tiếp theo cho agent máy kia

Notification/Reports đã có trên Git: work/notifications ở d1e9743, work/scrum-reports ở9abde88 (bao gồm Notification). Người dùng xác nhận test ổn; nhánh nền chưa ghép các commit đó. Owner máy hiện tại sẽ ghép shared BFF/shell với project2A riêng.

**[Nhiệm vụ chi tiết và prompt: NEXT_REMOTE_TASKS.md trong backend](https://github.com/ngothithanhh/jira/blob/feat/backend-integration/docs/NEXT_REMOTE_TASKS.md).**

| Đợt | Phạm vi FE → BE → DB | Nhánh |
|---|---|---|
| C1, làm trước | Thành viên project: list/tìm/thêm/đổi role/gỡ, quyền/PM/lead và counts | work/project-members ở hai repo |
| C2, sau C1 được kiểm | Profile cá nhân và đổi mật khẩu/thu hồi phiên nhiều tab | work/account-profile ở hai repo |

Máy này giữ issue/backlog/sprint/board; không giao trùng. UI đã có: dùng lại members-screen.tsx và account-screen.tsx, không dựng lại. Chưa giao admin/global config/full dataset.

## Prompt gửi nguyên cho agent kia

```text
Đã nhận các commit Notification/Reports của bạn; giữ hai nhánh cũ để owner tích hợp, không làm lại.
Đọc BE docs/NEXT_REMOTE_TASKS.md và FE docs/CONNECTED_PROJECTS.md. Việc tiếp C1 là thành viên project đủ FE–API–DB, C2 sau khi C1 được kiểm là profile/password.
Fetch cả hai repo và tạo work/project-members từ origin/feat/backend-integration (BE) và origin/feat/backlog-ui-review (FE) mới nhất. Không dựa work/scrum-reports cũ, vì thiếu project2A và helper mutation/completion mới.
Trình plan C1 trước code: projectId/userId/roleId đúng bảng, ứng viên theo project/quyền có giới hạn, global role khác membership, transaction/lock/notification/audit và cache/context/count invalidation.
FE sở hữu features/connected/members/**, projects/[projectId]/members/page, tests/docs riêng; BE chỉ member/candidate theo plan được chốt. Shared BFF/client/session/shell/project gate/kit không sửa lẫn domain; patch cần thiết gửi commit nhỏ cho owner.
Dùng UI đã có và connectedMutation/completeConnectedMutation cùng scope cho mutation, không hồi phục request ghi bằng tài khoản khác. Kiểm PM thứhai/trùng/gỡ lead/SYSTEM_ADMIN và API trực tiếp trái quyền.
Tự test/build/review, commit/push work/project-members, gửi SHA FE+BE và URL/tài khoản local/từng bước kiểm. Dừng chờ người dùng trước C2.
C2 không fake avatar; password204 vô hiệu hóa token, cần clear cookie/ended đúng luồng, không gọi /me bằng token cũ để chốt thành công. Chi tiết trong handoff BE.
Bổ sung tài liệu test/luồng Notification/Reports đã làm khi tiện; không coi source diff là bằng chứng tự test ở máy khác.
```
