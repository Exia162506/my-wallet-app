import { useState, useEffect, useRef } from 'react';
import './index.css';

// นำเข้าโมดูลของ Firebase
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  FacebookAuthProvider, 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "firebase/auth";
import { getFirestore, collection, addDoc, query, where, onSnapshot, deleteDoc, doc } from "firebase/firestore";

// API Key จากโปรเจกต์ของคุณ
const firebaseConfig = {
  apiKey: "AIzaSyCpOOsNI0bKqTBTjORUbtVZgDLzW4jMReM",
  authDomain: "my-wallet-app-c71d1.firebaseapp.com",
  projectId: "my-wallet-app-c71d1",
  storageBucket: "my-wallet-app-c71d1.firebasestorage.app",
  messagingSenderId: "371537290832",
  appId: "1:371537290832:web:c98f9be7db1a4611c89355",
  measurementId: "G-BVLN2P331Y"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

const CATEGORIES = {
  Expense: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'ลงทุน', 'บิล/ค่าน้ำค่าไฟ', 'โอนไปบัญชีอื่น', 'อื่นๆ'],
  Income: ['เงินเดือน', 'รายได้เสริม', 'โบนัส', 'เงินคืน / ปันผล', 'อื่นๆ (รายรับ)'],
  Transfer: ['โอนบัญชีอื่น', 'เงินออม', 'อื่นๆ (โอน)'] 
};

const getWeekRange = (dateString) => {
  const curr = new Date(dateString);
  const day = curr.getDay();
  const first = curr.getDate() - day + (day === 0 ? -6 : 1);
  const firstDay = new Date(curr.setDate(first));
  const lastDay = new Date(curr.setDate(firstDay.getDate() + 6));
  const options = { day: 'numeric', month: 'short' };
  return `${firstDay.toLocaleDateString('th-TH', options)} - ${lastDay.toLocaleDateString('th-TH', options)}`;
};

const getMonthName = (dateString) => {
  return new Date(dateString).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
};

const getDayName = (dateString) => {
  return new Date(dateString).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

function App() {
  const [user, setUser] = useState(null); 
  const [transactions, setTransactions] = useState([]);
  const [viewMode, setViewMode] = useState('month'); 
  const [expandedGroups, setExpandedGroups] = useState({}); 
  const [showHistory, setShowHistory] = useState(false);
  const [viewSlipImage, setViewSlipImage] = useState(null);

  // สถานะหน้า Auth (login, register, forgot, verify-otp)
  const [authMode, setAuthMode] = useState('login'); 
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // ระบบ OTP
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [inputOtp, setInputOtp] = useState('');
  const [tempRegData, setTempRegData] = useState(null);

  // สถานะเปิด-ปิดเมนูโปรไฟล์
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // ระบบเช็กข้อผิดพลาดของการไม่อัปโหลดสลิป
  const [slipError, setSlipError] = useState(false);

  // ระบบ Export PDF
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');

  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Expense',
    category: CATEGORIES['Expense'][0],
    amount: '',
    note: '',
    slip: null 
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(collection(db, "transactions"), where("userId", "==", user.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTransactions(txs);
      });
      return () => unsubscribe();
    } else {
      setTransactions([]); 
    }
  }, [user]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google");
    }
  };

  const handleFacebookLogin = async () => {
    try {
      await signInWithPopup(auth, facebookProvider);
    } catch (error) {
      alert("เกิดข้อผิดพลาด: กรุณาตรวจสอบการตั้งค่า Facebook Login ใน Firebase Console");
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (error) {
      alert("❌ เข้าสู่ระบบไม่สำเร็จ: อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }
  };

  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    if (authPassword !== confirmPassword) {
      alert("❌ รหัสผ่านทั้งสองครั้งไม่ตรงกัน!");
      return;
    }
    if (authPassword.length < 6) {
      alert("❌ รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    setTempRegData({ email: authEmail, password: authPassword });
    
    alert(`📱 ระบบได้ส่งรหัส OTP ไปยังอีเมลของคุณแล้ว\n\n🔑 รหัส OTP ทดสอบของคุณคือ: [ ${otp} ]`);
    setAuthMode('verify-otp');
  };

  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    if (inputOtp !== generatedOtp) {
      alert("❌ รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, tempRegData.email, tempRegData.password);
      alert("✅ ยืนยัน OTP และสร้างบัญชีสำเร็จ!");
      setAuthMode('login');
      setInputOtp('');
      setAuthEmail('');
      setAuthPassword('');
      setConfirmPassword('');
    } catch (error) {
      alert("❌ เกิดข้อผิดพลาด: " + error.message);
      setAuthMode('register');
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!authEmail) {
      alert("กรุณากรอกอีเมลของคุณก่อนครับ");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, authEmail);
      alert(`✅ ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมล ${authEmail} เรียบร้อยแล้ว กรุณาตรวจสอบกล่องข้อความของคุณ`);
      setAuthMode('login');
    } catch (error) {
      alert("❌ เกิดข้อผิดพลาด: ไม่พบอีเมลนี้ในระบบ");
    }
  };

  const handleLogout = () => {
    if(window.confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) signOut(auth);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'type') {
      setFormData({ ...formData, type: value, category: CATEGORIES[value][0], slip: null });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSlipError(false);
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setFormData(prev => ({ ...prev, slip: canvas.toDataURL('image/jpeg', 0.7) }));
        setSlipError(false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const removeSlip = () => {
    setFormData(prev => ({ ...prev, slip: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.amount || !user) return;
    
    if (!formData.slip) {
      setSlipError(true);
      alert("⚠️ กรุณาแนบสลิปหรือหลักฐานการทำรายการก่อนบันทึกครับ");
      return;
    }
    
    const newTransaction = {
      userId: user.uid, 
      Date: formData.date,
      Type: formData.type,
      Category: formData.category,
      Amount: Number(formData.amount),
      Note: formData.note,
      Slip: formData.slip,
      createdAt: new Date().toISOString()
    };
    
    try {
      await addDoc(collection(db, "transactions"), newTransaction); 
      setFormData({ ...formData, amount: '', note: '', slip: null }); 
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSlipError(false);
      alert("✅ บันทึกรายการสำเร็จ!");
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  const handleDelete = async (id) => {
    if(window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
      await deleteDoc(doc(db, "transactions", id)); 
    }
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({
      ...prev, [groupKey]: prev[groupKey] === undefined ? false : !prev[groupKey] 
    }));
  };

  const groupedTransactions = transactions.reduce((acc, curr) => {
    let key = '';
    if (viewMode === 'day') key = getDayName(curr.Date);
    else if (viewMode === 'week') key = getWeekRange(curr.Date);
    else if (viewMode === 'month') key = getMonthName(curr.Date);

    if (!acc[key]) acc[key] = { items: [], totalIncome: 0, totalExpense: 0, sortDate: curr.Date };
    acc[key].items.push(curr);
    
    if (curr.Type === 'Income') acc[key].totalIncome += curr.Amount;
    else if (curr.Type === 'Expense') acc[key].totalExpense += curr.Amount;
    
    return acc;
  }, {});

  const sortedGroups = Object.keys(groupedTransactions).sort((a, b) => new Date(groupedTransactions[b].sortDate) - new Date(groupedTransactions[a].sortDate));

  const totalBalance = transactions.reduce((acc, curr) => {
    if (curr.Type === 'Income') return acc + Number(curr.Amount);
    if (curr.Type === 'Expense') return acc - Number(curr.Amount);
    return acc;
  }, 0);

  const currentMonth = new Date().toISOString().slice(0, 7); 
  const monthlyTransactions = transactions.filter(t => t.Date.startsWith(currentMonth));
  const currentMonthIncome = monthlyTransactions.filter(t => t.Type === 'Income').reduce((acc, curr) => acc + curr.Amount, 0);
  const currentMonthExpense = monthlyTransactions.filter(t => t.Type === 'Expense').reduce((acc, curr) => acc + curr.Amount, 0);

  const tabStyle = (mode) => ({
    flex: 1, padding: '10px', backgroundColor: viewMode === mode ? '#d4af37' : '#2a2a2a',
    color: viewMode === mode ? '#121212' : '#aaa', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderRadius: '8px'
  });

  const filteredExport = transactions.filter(t => {
    if (!exportStart || !exportEnd) return false;
    return t.Date >= exportStart && t.Date <= exportEnd;
  }).sort((a, b) => new Date(a.Date) - new Date(b.Date));

  const exportIncomeTotal = filteredExport.filter(t => t.Type === 'Income').reduce((a, b) => a + b.Amount, 0);
  const exportExpenseTotal = filteredExport.filter(t => t.Type === 'Expense').reduce((a, b) => a + b.Amount, 0);

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '90vh', padding: '20px' }}>
        <h1 className="text-gold" style={{ fontSize: '42px', marginBottom: '5px' }}>My Wallet</h1>
        <p style={{ color: '#aaa', marginBottom: '25px' }}>ระบบบัญชีรายรับ-รายจ่ายส่วนบุคคลบน Cloud</p>
        
        <div className="card" style={{ width: '100%', maxWidth: '380px', padding: '25px' }}>
          
          {authMode === 'login' && (
            <>
              <h3 style={{ textAlign: 'center', marginTop: 0, color: '#d4af37' }}>เข้าสู่ระบบ</h3>
              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="email" placeholder="อีเมลของคุณ" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
                <input type="password" placeholder="รหัสผ่าน" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
                <div style={{ textAlign: 'right', marginTop: '-5px' }}>
                  <span onClick={() => setAuthMode('forgot')} style={{ fontSize: '12px', color: '#aaa', cursor: 'pointer', textDecoration: 'underline' }}>ลืมรหัสผ่าน?</span>
                </div>
                <button type="submit" style={{ backgroundColor: '#d4af37', color: '#121212', fontWeight: 'bold' }}>เข้าสู่ระบบ</button>
              </form>
              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <span style={{ fontSize: '13px', color: '#aaa' }}>ยังไม่มีบัญชีใช่ไหม? </span>
                <span onClick={() => { setAuthMode('register'); setAuthPassword(''); setConfirmPassword(''); }} style={{ fontSize: '13px', color: '#d4af37', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>สร้างบัญชีใหม่</span>
              </div>
            </>
          )}

          {authMode === 'register' && (
            <>
              <h3 style={{ textAlign: 'center', marginTop: 0, color: '#d4af37' }}>สร้างบัญชีใหม่</h3>
              <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="email" placeholder="อีเมลของคุณ" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
                <input type="password" placeholder="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
                <input type="password" placeholder="ยืนยันรหัสผ่านอีกครั้ง" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                <button type="submit" style={{ backgroundColor: '#d4af37', color: '#121212', fontWeight: 'bold', marginTop: '5px' }}>ถัดไป (รับรหัส OTP)</button>
              </form>
              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <span style={{ fontSize: '13px', color: '#aaa' }}>มีบัญชีอยู่แล้ว? </span>
                <span onClick={() => setAuthMode('login')} style={{ fontSize: '13px', color: '#d4af37', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>เข้าสู่ระบบที่นี่</span>
              </div>
            </>
          )}

          {authMode === 'verify-otp' && (
            <>
              <h3 style={{ textAlign: 'center', marginTop: 0, color: '#d4af37' }}>ยืนยันรหัส OTP</h3>
              <p style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', marginBottom: '15px' }}>
                กรุณากรอกรหัส OTP 6 หลักที่ส่งไปยังอีเมล <strong>{authEmail}</strong>
              </p>
              <form onSubmit={handleVerifyOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="text" placeholder="กรอกรหัส OTP 6 หลัก" maxLength="6" value={inputOtp} onChange={(e) => setInputOtp(e.target.value)} style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '4px' }} required />
                <button type="submit" style={{ backgroundColor: '#4CAF50', color: '#fff', fontWeight: 'bold', marginTop: '5px' }}>ยืนยันและสมัครสมาชิก</button>
              </form>
              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <span onClick={() => setAuthMode('register')} style={{ fontSize: '13px', color: '#aaa', cursor: 'pointer', textDecoration: 'underline' }}>← กลับไปแก้ไขข้อมูล</span>
              </div>
            </>
          )}

          {authMode === 'forgot' && (
            <>
              <h3 style={{ textAlign: 'center', marginTop: 0, color: '#d4af37' }}>กู้คืนรหัสผ่าน</h3>
              <p style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', marginBottom: '15px' }}>
                กรอกอีเมลของคุณเพื่อรับลิงก์ / OTP สำหรับตั้งรหัสผ่านใหม่
              </p>
              <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="email" placeholder="อีเมลที่ลงทะเบียนไว้" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
                <button type="submit" style={{ backgroundColor: '#d4af37', color: '#121212', fontWeight: 'bold', marginTop: '5px' }}>ส่งรหัสกู้คืน</button>
              </form>
              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <span onClick={() => setAuthMode('login')} style={{ fontSize: '13px', color: '#d4af37', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>← กลับไปหน้าเข้าสู่ระบบ</span>
              </div>
            </>
          )}

          {authMode !== 'verify-otp' && authMode !== 'forgot' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', color: '#666' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#333' }}></div>
                <span style={{ padding: '0 10px', fontSize: '12px' }}>หรือเชื่อมต่อผ่าน</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#333' }}></div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={handleGoogleLogin} style={{ padding: '12px', fontSize: '14px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', backgroundColor: '#fff', color: '#000', border: 'none', fontWeight: '500' }}>
                  <img src="https://cdn-icons-png.flaticon.com/512/300/300221.png" alt="google" style={{ width: '20px' }} />
                  ดำเนินการต่อด้วย Google
                </button>

                <button onClick={handleFacebookLogin} style={{ padding: '12px', fontSize: '14px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', backgroundColor: '#1877F2', color: '#fff', border: 'none', fontWeight: '500' }}>
                  <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="facebook" style={{ width: '20px', filter: 'brightness(0) invert(1)' }} />
                  ดำเนินการต่อด้วย Facebook
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    );
  }

  return (
    <div>
      <style>
        {`
          @media screen {
            .print-only { display: none !important; }
          }
          @media print {
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            body, html { background-color: #fff !important; color: #000 !important; }
            table, th, td { border: 1px solid #000 !important; color: #000 !important; }
            * { text-shadow: none !important; }
            @page { margin: 20px; }
          }
        `}
      </style>

      {/* Header พร้อมเมนูรูปโปรไฟล์ */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: '#1e1e1e', padding: '10px 20px', borderRadius: '12px' }}>
        <h2 className="text-gold" style={{ margin: 0 }}>My Wallet</h2>
        
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <div onClick={() => setShowProfileMenu(!showProfileMenu)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <img src={user.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png"} alt="profile" style={{ width: '38px', height: '38px', borderRadius: '50%', border: '2px solid #d4af37', objectFit: 'cover' }} referrerPolicy="no-referrer" />
          </div>

          {showProfileMenu && (
            <div style={{
              position: 'absolute', top: '50px', right: '0',
              backgroundColor: '#2a2a2a', border: '1px solid #444',
              borderRadius: '8px', width: '180px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 1000, overflow: 'hidden'
            }}>
              <div 
                onClick={() => { setShowExportModal(true); setShowProfileMenu(false); }} 
                style={{ padding: '12px 15px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid #333', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#333'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                📄 สรุป PDF
              </div>
              <div 
                onClick={() => { alert('⚙️ เมนูตั้งค่า: กำลังจะมาในอัปเดตหน้าครับ!'); setShowProfileMenu(false); }} 
                style={{ padding: '12px 15px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid #333', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#333'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                ⚙️ ตั้งค่า
              </div>
              <div 
                onClick={() => { setShowProfileMenu(false); handleLogout(); }} 
                style={{ padding: '12px 15px', color: '#ff4d4d', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#333'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                🚪 ออกจากระบบ
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="card no-print" style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, color: '#aaa' }}>ยอดเงินคงเหลือรวม</p>
        <h1 style={{ margin: '10px 0', fontSize: '36px', color: '#d4af37' }}>฿{totalBalance.toLocaleString()}</h1>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
          สรุปยอดเดือนปัจจุบัน ({new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })})
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #333' }}>
          <div><p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>รายรับรวม</p><p className="income-text" style={{ margin: 0, fontSize: '18px' }}>+฿{currentMonthIncome.toLocaleString()}</p></div>
          <div><p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>ใช้ไปแล้ว</p><p className="expense-text" style={{ margin: 0, fontSize: '18px' }}>-฿{currentMonthExpense.toLocaleString()}</p></div>
        </div>
      </div>

      <div className="card no-print">
        <h3 style={{ marginTop: 0 }}>เพิ่มรายการใหม่</h3>
        <form onSubmit={handleSubmit}>
          <input type="date" name="date" value={formData.date} onChange={handleChange} required />
          <div style={{ display: 'flex', gap: '10px' }}>
            <select name="type" value={formData.type} onChange={handleChange}>
              <option value="Expense">รายจ่าย</option>
              <option value="Income">รายรับ</option>
              <option value="Transfer">โอนเงิน (ยอดไม่ลด)</option>
            </select>
            <select name="category" value={formData.category} onChange={handleChange}>
              {CATEGORIES[formData.type].map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <input type="number" name="amount" placeholder="จำนวนเงิน (บาท)" value={formData.amount} onChange={handleChange} required />
          <input type="text" name="note" placeholder="บันทึกย่อ (ถ้ามี)" value={formData.note} onChange={handleChange} />
          
          <div style={{ marginTop: '10px', backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '8px', border: slipError ? '1px solid #ff4d4d' : '1px solid #444' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: slipError ? '#ff4d4d' : '#ccc', fontWeight: slipError ? 'bold' : 'normal' }}>
              {slipError ? '* กรุณาแนบสลิปก่อนบันทึก!' : 'แนบสลิป/หลักฐาน (บังคับ)'}
            </p>
            <input type="file" accept="image/*" onChange={handleImageUpload} ref={fileInputRef} style={{ padding: '0', backgroundColor: 'transparent', border: 'none', color: '#fff' }} />
            {formData.slip && (
              <div style={{ marginTop: '15px', position: 'relative', display: 'inline-block' }}>
                <img src={formData.slip} alt="preview" style={{ maxHeight: '100px', borderRadius: '8px', border: '1px solid #444' }} />
                <button type="button" onClick={removeSlip} style={{ position: 'absolute', top: '-10px', right: '-10px', backgroundColor: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
              </div>
            )}
          </div>
          <button type="submit" style={{ marginTop: '15px' }}>บันทึกรายการ</button>
        </form>
      </div>

      <div className="card no-print">
        <div onClick={() => setShowHistory(!showHistory)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
          <h3 style={{ margin: 0 }}>ประวัติการใช้งาน</h3>
          <span style={{ fontSize: '14px', color: '#d4af37', fontWeight: 'bold' }}>{showHistory ? '▼ ซ่อนประวัติ' : '▶ ดูประวัติ'}</span>
        </div>
        
        {showHistory && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button type="button" style={tabStyle('day')} onClick={() => setViewMode('day')}>รายวัน</button>
              <button type="button" style={tabStyle('week')} onClick={() => setViewMode('week')}>รายสัปดาห์</button>
              <button type="button" style={tabStyle('month')} onClick={() => setViewMode('month')}>รายเดือน</button>
            </div>
            {sortedGroups.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>ยังไม่มีรายการ</p>}
            {sortedGroups.map(groupKey => {
              const isOpen = expandedGroups[groupKey] !== false; 
              return (
                <div key={groupKey} style={{ marginBottom: '15px' }}>
                  <div onClick={() => toggleGroup(groupKey)} style={{ backgroundColor: '#2a2a2a', padding: '10px 15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ fontSize: '12px', color: '#888' }}>{isOpen ? '▼' : '▶'}</span><span style={{ color: '#d4af37', fontWeight: 'bold' }}>{groupKey}</span></div>
                    <span style={{ fontSize: '14px' }}>
                      {groupedTransactions[groupKey].totalIncome > 0 && <span className="income-text">+{groupedTransactions[groupKey].totalIncome.toLocaleString()} </span>}
                      {groupedTransactions[groupKey].totalIncome > 0 && groupedTransactions[groupKey].totalExpense > 0 && <span style={{ color: '#555', margin: '0 5px' }}>|</span>}
                      {groupedTransactions[groupKey].totalExpense > 0 && <span className="expense-text">-{groupedTransactions[groupKey].totalExpense.toLocaleString()}</span>}
                    </span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '0 10px', marginTop: '5px' }}>
                      {groupedTransactions[groupKey].items.slice().reverse().map(item => (
                        <div key={item.id} className="transaction-item" style={{ alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '500' }}>{item.Category}</div>
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px' }}>{item.Note ? `${item.Note} • ` : ''} {new Date(item.Date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                            {item.Slip && <img src={item.Slip} alt="slip" onClick={() => setViewSlipImage(item.Slip)} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid #444' }} />}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                            <div className={item.Type === 'Income' ? 'income-text' : item.Type === 'Expense' ? 'expense-text' : ''} style={item.Type === 'Transfer' ? { color: '#4da6ff', fontWeight: 'bold' } : {}}>
                              {item.Type === 'Income' ? '+' : item.Type === 'Expense' ? '-' : ''}฿{Number(item.Amount).toLocaleString()}
                            </div>
                            <button onClick={() => handleDelete(item.id)} style={{ padding: '5px 10px', backgroundColor: '#333', color: '#ff4d4d', borderRadius: '4px', fontSize: '12px', border: 'none', cursor: 'pointer' }}>ลบ</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {viewSlipImage && (
        <div className="no-print" onClick={() => setViewSlipImage(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, cursor: 'zoom-out' }}>
          <img src={viewSlipImage} alt="slip-full" style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '12px' }} />
        </div>
      )}

      {showExportModal && (
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '50px', zIndex: 1000, overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#1e1e1e', width: '90%', maxWidth: '600px', padding: '20px', borderRadius: '12px', position: 'relative' }}>
            <button onClick={() => setShowExportModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#aaa', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            <h2 style={{ marginTop: 0, color: '#d4af37' }}>ออกรายงาน PDF</h2>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', color: '#aaa' }}>ตั้งแต่วันที่</label>
                <input type="date" value={exportStart} onChange={e => setExportStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', color: '#aaa' }}>ถึงวันที่</label>
                <input type="date" value={exportEnd} onChange={e => setExportEnd(e.target.value)} />
              </div>
            </div>

            {exportStart && exportEnd && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#2a2a2a', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                  <div style={{ textAlign: 'center' }}><p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>รายรับช่วงนี้</p><h3 style={{ margin: '5px 0 0 0', color: '#4CAF50' }}>+฿{exportIncomeTotal.toLocaleString()}</h3></div>
                  <div style={{ textAlign: 'center' }}><p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>รายจ่ายช่วงนี้</p><h3 style={{ margin: '5px 0 0 0', color: '#ff4d4d' }}>-฿{exportExpenseTotal.toLocaleString()}</h3></div>
                  <div style={{ textAlign: 'center' }}><p style={{ margin: 0, fontSize: '12px', color: '#aaa' }}>คงเหลือช่วงนี้</p><h3 style={{ margin: '5px 0 0 0', color: '#d4af37' }}>฿{(exportIncomeTotal - exportExpenseTotal).toLocaleString()}</h3></div>
                </div>
                <button onClick={() => window.print()} style={{ width: '100%', padding: '15px', fontSize: '16px' }}>🖨️ พิมพ์ / บันทึกเป็น PDF</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ส่วนที่จะถูกพิมพ์ลง PDF */}
      <div className="print-only" style={{ padding: '20px', width: '100%', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', margin: '0 0 10px 0', fontSize: '24px' }}>สรุปรายการบัญชี My Wallet</h1>
        <p style={{ textAlign: 'center', margin: '0 0 20px 0' }}>ตั้งแต่วันที่ {exportStart ? new Date(exportStart).toLocaleDateString('th-TH') : '-'} ถึง {exportEnd ? new Date(exportEnd).toLocaleDateString('th-TH') : '-'}</p>
        
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '30px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
          <div><strong>รายรับรวม:</strong> {exportIncomeTotal.toLocaleString()} บาท</div>
          <div><strong>รายจ่ายรวม:</strong> {exportExpenseTotal.toLocaleString()} บาท</div>
          <div><strong>คงเหลือสุทธิ:</strong> {(exportIncomeTotal - exportExpenseTotal).toLocaleString()} บาท</div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>วันที่</th>
              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>ประเภท</th>
              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>หมวดหมู่ / บันทึก</th>
              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>สลิป</th>
              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
            </tr>
          </thead>
          <tbody>
            {filteredExport.map((item, index) => (
              <tr key={index}>
                <td style={{ border: '1px solid #000', padding: '8px', verticalAlign: 'middle' }}>{new Date(item.Date).toLocaleDateString('th-TH')}</td>
                <td style={{ border: '1px solid #000', padding: '8px', verticalAlign: 'middle' }}>{item.Type === 'Income' ? 'รายรับ' : item.Type === 'Expense' ? 'รายจ่าย' : 'โอนเงิน'}</td>
                <td style={{ border: '1px solid #000', padding: '8px', verticalAlign: 'middle' }}>{item.Category} {item.Note ? `(${item.Note})` : ''}</td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                  {item.Slip ? (
                    <img src={item.Slip} alt="slip" style={{ width: '45px', height: '45px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #999' }} />
                  ) : '-'}
                </td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', verticalAlign: 'middle', color: item.Type === 'Income' ? 'green' : item.Type === 'Expense' ? 'red' : 'blue' }}>
                  {item.Type === 'Expense' ? '-' : ''}{Number(item.Amount).toLocaleString()}
                </td>
              </tr>
            ))}
            {filteredExport.length === 0 && (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', border: '1px solid #000' }}>ไม่พบรายการในช่วงวันที่เลือก</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}

export default App;