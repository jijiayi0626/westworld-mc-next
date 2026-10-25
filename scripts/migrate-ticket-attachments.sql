-- 工单回复附件（图片 / PDF / ZIP），存 R2 uploads/tickets/
ALTER TABLE support_ticket_replies ADD COLUMN attachments TEXT DEFAULT '';
