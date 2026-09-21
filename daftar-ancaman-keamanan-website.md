# Daftar Ancaman Keamanan Website (Berdasarkan Tingkat Bahaya)

Dokumen ini berisi daftar jenis serangan siber pada aplikasi web, dikelompokkan berdasarkan tingkat dampaknya. Gunakan dokumen ini sebagai referensi untuk mengaudit dan memperkuat keamanan sistem — pastikan setiap poin di bawah ini memiliki mitigasi yang sesuai pada kode/infrastruktur.

---

## 🟢 Tingkat Ringan (Mengganggu & Eksploitasi Dasar)

Serangan di tingkat ini biasanya tidak langsung merusak database, tetapi mengganggu performa, merusak reputasi, atau menjadi langkah awal (reconnaissance) sebelum penyerang melakukan serangan yang lebih besar.

- **Spamming (Form & Komentar)**: Pengisian formulir kontak atau kolom komentar secara otomatis oleh bot untuk menyebarkan link iklan, malware, atau menimbun penyimpanan data.
- **Enumerasi Pengguna (User Enumeration)**: Penyerang menebak nama pengguna (username) yang valid melalui pesan error login (misal: "Password salah" vs "Username tidak ditemukan") atau melalui API publik seperti `/wp-json/wp/v2/users` pada WordPress.
- **Directory Traversal (Path Traversal)**: Memanfaatkan celah keamanan pada input file untuk mengakses folder atau file sensitif di luar direktori utama website (misalnya mencoba mengakses file `../../../../etc/passwd`).
- **Clickjacking**: Menipu pengguna agar mengklik elemen yang tidak terlihat atau disamarkan (menggunakan iframe transparan) di atas halaman web yang sah untuk mencuri klik atau persetujuan.
- **Open Redirect**: Memanfaatkan parameter URL redirect yang tidak divalidasi untuk menipu pengguna agar mengunjungi situs phishing.

---

## 🟡 Tingkat Sedang (Eksploitasi Sesi & Gangguan Layanan)

Serangan tingkat ini menargetkan pengguna website secara langsung, memanipulasi logika aplikasi, atau mencoba membuat website tidak dapat diakses.

- **Cross-Site Scripting (XSS)**: Menyuntikkan skrip berbahaya (biasanya JavaScript) ke dalam halaman web yang kemudian dieksekusi oleh browser pengguna lain.
  - *Stored XSS*: Skrip disimpan di database (misal di kolom komentar) dan mengeksekusi setiap kali halaman dimuat.
  - *Reflected XSS*: Skrip dikirim melalui parameter URL berbahaya.
  - *DOM-based XSS*: Kerentanan terjadi langsung pada skrip sisi klien (client-side).
- **Cross-Site Request Forgery (CSRF)**: Memaksa pengguna yang sudah terautentikasi untuk melakukan tindakan yang tidak mereka inginkan pada aplikasi web (misal: mengubah email atau mentransfer dana tanpa sepengetahuan mereka).
- **DoS & DDoS (Denial of Service)**: Membanjiri server dengan lalu lintas (traffic) palsu dari satu sumber (DoS) atau ribuan sumber (DDoS) untuk menghabiskan sumber daya server sehingga website tumbang.
- **Brute Force Attack**: Mencoba kombinasi username dan password secara terus-menerus menggunakan otomatisasi hingga berhasil masuk.
- **Credential Stuffing**: Varian dari brute force di mana penyerang menggunakan daftar kombinasi username/password yang bocor dari website lain, memanfaatkan kebiasaan pengguna yang memakai password yang sama.
- **Insecure Direct Object References (IDOR)**: Terjadi ketika aplikasi menyediakan akses langsung ke objek berdasarkan input dari pengguna (misal: mengubah parameter `id=1001` menjadi `id=1002` untuk melihat invoice orang lain tanpa validasi hak akses).
- **Broken Object Level Authorization (BOLA) / Broken Function Level Authorization (BFLA)**: Kegagalan sistem dalam memverifikasi apakah pengguna memiliki hak akses untuk mengeksekusi fungsi atau memodifikasi data tertentu (sering ditemukan pada API).
- **Session Hijacking / Fixation**: Mencuri atau memanipulasi session ID pengguna untuk mengambil alih akun mereka tanpa perlu mengetahui password-nya.

---

## 🔴 Tingkat Berat (Kebocoran Data & Pengambilalihan Server)

Serangan di tingkat ini dapat menghancurkan bisnis secara instan melalui pencurian data massal, enkripsi data untuk tebusan, atau kendali penuh atas infrastruktur server.

- **SQL Injection (SQLi)**: Menyuntikkan perintah SQL berbahaya ke dalam input form atau URL untuk memanipulasi database. Penyerang bisa membaca, mengubah, atau menghapus seluruh isi database.
- **NoSQL / GraphQL Injection**: Mirip dengan SQLi, tetapi menargetkan database non-relasional (seperti MongoDB) atau endpoint API GraphQL dengan memanfaatkan validasi input yang lemah.
- **Remote Code Execution (RCE)**: Kerentanan paling berbahaya di mana penyerang dapat menjalankan perintah sistem operasi (system commands) secara langsung di server target.
- **Server-Side Request Forgery (SSRF)**: Memaksa server website untuk melakukan request ke server internal lain atau layanan eksternal. Sering digunakan untuk mencuri metadata cloud (seperti AWS IAM credentials).
- **Local / Remote File Inclusion (LFI/RFI)**: Memaksa server untuk memuat dan mengeksekusi file lokal yang ada di server atau file berbahaya dari server eksternal.
- **XML External Entity (XXE) Injection**: Menyerang aplikasi yang mengurai (parsing) input XML, memungkinkan penyerang melihat file internal server atau melakukan SSRF.
- **Insecure Deserialization**: Mengubah objek data yang diserialisasi untuk menyuntikkan kode berbahaya, yang ketika di-deserialisasi oleh server, akan mengeksekusi kode tersebut (sering berujung pada RCE).
- **Supply Chain Attack**: Menyerang website bukan dari kode buatannya sendiri, melainkan melalui pustaka pihak ketiga (third-party dependencies, NPM, Composer, pip) yang telah disusupi malware.
- **Ransomware & Defacement**: Penyerang yang berhasil masuk ke server mengunci/mengenkripsi seluruh data web untuk meminta tebusan (ransomware), atau mengubah tampilan visual halaman depan website secara total (defacement).

---

## Catatan Penggunaan

Dokumen ini dimaksudkan sebagai checklist ancaman untuk diaudit satu per satu. Untuk setiap poin, pastikan ada mitigasi yang diterapkan, misalnya:

- Validasi & sanitasi input di sisi server (bukan hanya client-side)
- Parameterized queries / prepared statements untuk mencegah SQLi
- Output encoding & Content Security Policy (CSP) untuk mencegah XSS
- CSRF token pada setiap form yang mengubah state
- Rate limiting & CAPTCHA untuk mencegah brute force, credential stuffing, spam
- Validasi otorisasi di level objek/fungsi (bukan hanya autentikasi) untuk mencegah IDOR/BOLA/BFLA
- Audit rutin terhadap dependency pihak ketiga (npm audit, pip-audit, dsb.)
- Least privilege pada kredensial server/cloud untuk membatasi dampak SSRF/RCE
