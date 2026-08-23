# Futures Dashboard — Public Demo

เวอร์ชัน demo แบบ static ของ futures trading dashboard สำหรับ host บน GitHub Pages

## ⚠️ ตัวเลขในหน้านี้ไม่ใช่ยอดบัญชีจริง

จำนวนเงินทั้งหมด (equity, notional, PnL, position size) ถูก **scale ให้อิงทุนสมมติ $10,000**
โครงสร้างข้อมูล สัดส่วนพอร์ต ราคาตลาด และเปอร์เซ็นต์ทั้งหมดคงเดิม เพื่อให้หน้าเว็บ
render เหมือนเวอร์ชันจริงทุกประการ แต่ไม่เปิดเผยยอดเงินในบัญชีจริง

ไฟล์ในโฟลเดอร์นี้ถูก generate โดย `make_public_demo.py` จาก repo หลัก (private)

## อัปเดตข้อมูล

รันจาก repo หลัก:

```bash
python make_public_demo.py
```

แล้ว commit/push โฟลเดอร์นี้ตามปกติ

## หมายเหตุ

- เป็นหน้าเว็บ static ล้วน ไม่มี backend — ข้อมูลถูก generate ไว้ล่วงหน้าใน `*_data.js`
- ข้อมูลไม่ได้อัปเดตอัตโนมัติ จะเป็นค่า ณ ครั้งล่าสุดที่ push
- ไม่มี API key หรือ credential ใดๆ อยู่ในไฟล์ชุดนี้
