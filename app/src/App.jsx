import { useState, useEffect, useRef } from 'react';
import './index.css';

// นำเข้า Tesseract สำหรับระบบสแกนสลิปอัตโนมัติ
import Tesseract from 'tesseract.js';

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
  Transfer: ['โอนย้ายเงินภายใน'] 
};

const DEFAULT_WALLETS = [
  { id: 'Cash', name: 'เงินสด', accountNumber: '-', accountName: '-', color: '#d4af37', active: true, custom: false },
  { id: 'KBank', name: 'กสิกรไทย (KBank)', accountNumber: '', accountName: '', color: '#138f2d', active: true, custom: false },
  { id: 'SCB', name: 'ไทยพาณิชย์ (SCB)', accountNumber: '', accountName: '', color: '#4e2a84', active: true, custom: false },
  { id: 'KTB', name: 'กรุงไทย (KTB)', accountNumber: '', accountName: '', color: '#00aeef', active: true, custom: false },
  { id: 'BBL', name: 'กรุงเทพ (BBL)', accountNumber: '', accountName: '', color: '#1e4598', active: true, custom: false },
  { id: 'TrueMoney', name: 'TrueMoney Wallet', accountNumber: '', accountName: '', color: '#ff6600', active: true, custom: false },
  { id: 'Other', name: 'บัญชีอื่นๆ (Other)', accountNumber: '', accountName: '', color: '#607d8b', active: true, custom: false }
];

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
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split('T')[0]); 
  const [expandedGroups, setExpandedGroups] = useState({}); 
  const [viewSlipImage, setViewSlipImage] = useState(null);

  const [customAlert, setCustomAlert] = useState(null);

  const [wallets, setWallets] = useState(() => {
    const saved = localStorage.getItem('my_wallet_settings_v5');
    if (saved) return JSON.parse(saved);
    return DEFAULT_WALLETS;
  });

  const [draggedWalletIndex, setDraggedWalletIndex] = useState(null);

  const [newWalletName, setNewWalletName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');

  useEffect(() => {
    localStorage.setItem('my_wallet_settings_v5', JSON.stringify(wallets));
  }, [wallets]);

  const activeWallets = wallets.filter(w => w.active);

  const [authMode, setAuthMode] = useState('login'); 
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [inputOtp, setInputOtp] = useState('');
  const [tempRegData, setTempRegData] = useState(null);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [slipError, setSlipError] = useState(false);
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Expense',
    category: CATEGORIES['Expense'][0],
    amount: '',
    note: '',
    slip: null,
    wallet: 'เงินสด',
    fromWallet: 'เงินสด',
    toWallet: 'เงินสด'
  });

  useEffect(() => {
    if (activeWallets.length > 0) {
      const activeNames = activeWallets.map(w => w.name);
      setFormData(prev => ({
        ...prev,
        wallet: activeNames.includes(prev.wallet) ? prev.wallet : activeNames[0],
        fromWallet: activeNames.includes(prev.fromWallet) ? prev.fromWallet : activeNames[0],
        toWallet: activeNames.includes(prev.toWallet) ? prev.toWallet : (activeNames[1] || activeNames[0])
      }));
    }
  }, [wallets]);

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

  // ฟังก์ชันจัดลำดับบัญชีด้วย Drag and Drop (ไม่ให้ชื่อฟังก์ชันชนกัน)
  const handleWalletDragStart = (e, index) => {
    setDraggedWalletIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleWalletDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleWalletDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedWalletIndex === null || draggedWalletIndex === targetIndex) return;
    const newWallets = [...wallets];
    const [movedWallet] = newWallets.splice(draggedWalletIndex, 1);
    newWallets.splice(targetIndex, 0, movedWallet);
    setWallets(newWallets);
    setDraggedWalletIndex(null);
  };

  const handleAddCustomWallet = (e) => {
    e.preventDefault();
    if (!newWalletName.trim()) return;

    const colors = ['#00acc1', '#ab47bc', '#ef5350', '#ffa726', '#26a69a', '#7e57c2'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newWallet = {
      id: 'custom_' + Date.now(),
      name: newWalletName.trim(),
      accountName: newAccountName.trim() || '-',
      accountNumber: newAccountNumber.trim() || '-',
      color: randomColor,
      active: true,
      custom: true
    };

    setWallets([...wallets, newWallet]);
    setNewWalletName('');
    setNewAccountName('');
    setNewAccountNumber('');
  };

  const handleDeleteCustomWallet = (id) => {
    if (window.confirm("คุณต้องการลบบัญชีนี้ใช่หรือไม่?")) {
      setWallets(wallets.filter(w => w.id !== id));
    }
  };

  const scanSlipOCR = async (imageSrc) => {
    try {
      const { data: { text } } = await Tesseract.recognize(imageSrc, 'tha+eng');
      console.log("OCR Extracted Text:", text);

      let detectedAmount = '';

      const decimalRegex = /[0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2}/g;
      const decimalMatches = text.match(decimalRegex);

      if (decimalMatches && decimalMatches.length > 0) {
        const validAmounts = decimalMatches.map(m => m.replace(/,/g, '')).filter(num => Number(num) > 0 && Number(num) < 1000000);
        if (validAmounts.length > 0) {
          detectedAmount = validAmounts[0]; 
        }
      }

      if (!detectedAmount) {
        const generalRegex = /\d+/g;
        const generalMatches = text.match(generalRegex);
        if (generalMatches && generalMatches.length > 0) {
          const valid = generalMatches.map(Number.parseFloat).filter(n => n > 0 && n < 1000000);
          if (valid.length > 0) {
            detectedAmount = valid[0].toString();
          }
        }
      }

      let matchedWallet = null;
      let detectedType = 'Expense'; 

      const lowerText = text.toLowerCase();
      if (
        lowerText.includes('รับเงิน') || 
        lowerText.includes('ยอดเงินเข้า') || 
        lowerText.includes('รับโอน') || 
        lowerText.includes('receive') || 
        lowerText.includes('transfer in') ||
        lowerText.includes('โอนเงินสำเร็จ')
      ) {
        detectedType = 'Income';
      }

      const otherBankKeywords = [
        'กรุงศรี', 'krungsri', 'อยุธยา', 'ttb', 'ทีทีบี', 'ทหารไทย', 'ธนชาต', 
        'ออมสิน', 'gsb', 'ธ.ก.ส', 'baac', 'ธอส', 'ghb', 'ghbank', 
        'ยูโอบี', 'uob', 'ซีไอเอ็มบี', 'cimb', 'เกียรตินาคิน', 'kkp', 
        'ทิสโก้', 'tisco', 'แลนด์', 'lh bank', 'ไทยเครดิต', 'thai credit'
      ];

      for (let w of activeWallets) {
        const isNameMatch = w.name && text.toLowerCase().includes(w.name.toLowerCase().split(' ')[0]);
        const isAccNumMatch = w.accountNumber && w.accountNumber !== '-' && text.includes(w.accountNumber);
        const isAccNameMatch = w.accountName && w.accountName !== '-' && text.includes(w.accountName);

        if (isNameMatch || isAccNumMatch || isAccNameMatch) {
          matchedWallet = w.name;
          break;
        }
      }

      if (!matchedWallet) {
        for (let keyword of otherBankKeywords) {
          if (lowerText.includes(keyword)) {
            const otherWallet = activeWallets.find(w => w.id === 'Other' || w.name.includes('อื่นๆ'));
            if (otherWallet) {
              matchedWallet = otherWallet.name;
            }
            break;
          }
        }
      }

      setFormData(prev => ({
        ...prev,
        amount: detectedAmount || prev.amount,
        type: detectedType,
        category: CATEGORIES[detectedType][0], 
        wallet: matchedWallet && prev.type !== 'Transfer' ? matchedWallet : prev.wallet
      }));

    } catch (error) {
      console.error("OCR Error:", error);
    } finally {
      setIsScanning(false);
    }
  };

  const processFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setIsScanning(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        setFormData(prev => ({ ...prev, slip: dataUrl }));
        setSlipError(false);
        scanSlipOCR(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };
  const handleDragOver = (e) => e.preventDefault();

  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) processFile(blob);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleGoogleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { setCustomAlert("เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google"); } };
  const handleFacebookLogin = async () => { try { await signInWithPopup(auth, facebookProvider); } catch (e) { setCustomAlert("เกิดข้อผิดพลาด: กรุณาตรวจสอบการตั้งค่า Facebook Login ใน Firebase Console"); } };
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, authEmail, authPassword); } catch (e) { setCustomAlert("❌ เข้าสู่ระบบไม่สำเร็จ: อีเมลหรือรหัสผ่านไม่ถูกต้อง"); }
  };
  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    if (authPassword !== confirmPassword) { setCustomAlert("❌ รหัสผ่านทั้งสองครั้งไม่ตรงกัน!"); return; }
    if (authPassword.length < 6) { setCustomAlert("❌ รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    setTempRegData({ email: authEmail, password: authPassword });
    setCustomAlert(`📱 ระบบได้ส่งรหัส OTP ไปยังอีเมลของคุณแล้ว\n\n🔑 รหัส OTP ทดสอบของคุณคือ: [ ${otp} ]`);
    setAuthMode('verify-otp');
  };
  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    if (inputOtp !== generatedOtp) { setCustomAlert("❌ รหัส OTP ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"); return; }
    try {
      await createUserWithEmailAndPassword(auth, tempRegData.email, tempRegData.password);
      setCustomAlert("✅ ยืนยัน OTP และสร้างบัญชีสำเร็จ!");
      setAuthMode('login');
      setInputOtp('');
      setAuthEmail('');
      setAuthPassword('');
      setConfirmPassword('');
    } catch (error) { setCustomAlert("❌ เกิดข้อผิดพลาด: " + error.message); setAuthMode('register'); }
  };
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!authEmail) { setCustomAlert("กรุณากรอกอีเมลของคุณก่อนครับ"); return; }
    try {
      await sendPasswordResetEmail(auth, authEmail);
      setCustomAlert(`✅ ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมล ${authEmail} เรียบร้อยแล้ว`);
      setAuthMode('login');
    } catch (e) { setCustomAlert("❌ เกิดข้อผิดพลาด: ไม่พบอีเมลนี้ในระบบ"); }
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

  const handleImageUpload = (e) => { const f = e.target.files[0]; if (f) processFile(f); };
  const removeSlip = () => { setFormData(prev => ({ ...prev, slip: null })); if (fileInputRef.current) fileInputRef.current.value = ""; };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.amount || !user) return;
    if (!formData.slip) { setSlipError(true); setCustomAlert("⚠️ กรุณาแนบสลิปหรือหลักฐานการทำรายการก่อนบันทึกครับ"); return; }
    
    const newTransaction = {
      userId: user.uid, 
      Date: formData.date,
      Type: formData.type,
      Category: formData.category,
      Amount: Number(formData.amount),
      Note: formData.note,
      Slip: formData.slip,
      Wallet: formData.type === 'Transfer' ? null : formData.wallet,
      FromWallet: formData.type === 'Transfer' ? formData.fromWallet : null,
      ToWallet: formData.type === 'Transfer' ? formData.toWallet : null,
      createdAt: new Date().toISOString()
    };
    
    try {
      await addDoc(collection(db, "transactions"), newTransaction); 
      setFormData({ ...formData, amount: '', note: '', slip: null }); 
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSlipError(false);
      setCustomAlert("✅ บันทึกรายการสำเร็จ!");
    } catch (error) { setCustomAlert("เกิดข้อผิดพลาดในการบันทึกข้อมูล"); }
  };

  const handleDelete = async (id) => {
    if(window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
      await deleteDoc(doc(db, "transactions", id)); 
    }
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: prev[groupKey] === undefined ? false : !prev[groupKey] }));
  };

  const transactionsToDisplay = viewMode === 'day' ? transactions.filter(t => t.Date === selectedDay) : transactions;

  const groupedTransactions = transactionsToDisplay.reduce((acc, curr) => {
    let key = viewMode === 'day' ? getDayName(curr.Date) : viewMode === 'week' ? getWeekRange(curr.Date) : getMonthName(curr.Date);
    if (!acc[key]) acc[key] = { items: [], totalIncome: 0, totalExpense: 0, sortDate: curr.Date };
    acc[key].items.push(curr);
    if (curr.Type === 'Income') acc[key].totalIncome += curr.Amount;
    else if (curr.Type === 'Expense') acc[key].totalExpense += curr.Amount;
    return acc;
  }, {});

  const sortedGroups = Object.keys(groupedTransactions).sort((a, b) => new Date(groupedTransactions[b].sortDate) - new Date(groupedTransactions[a].sortDate));

  const walletBalances = {};
  let totalBalance = 0;

  transactions.forEach(t => {
    const amt = Number(t.Amount);
    if (t.Type === 'Income') {
      totalBalance += amt;
      const w = t.Wallet || 'เงินสด';
      if (walletBalances[w] === undefined) walletBalances[w] = 0;
      walletBalances[w] += amt;
    } else if (t.Type === 'Expense') {
      totalBalance -= amt;
      const w = t.Wallet || 'เงินสด';
      if (walletBalances[w] === undefined) walletBalances[w] = 0;
      walletBalances[w] -= amt;
    } else if (t.Type === 'Transfer') {
      const fW = t.FromWallet || 'เงินสด';
      const tW = t.ToWallet || 'กสิกรไทย (KBank)';
      if (walletBalances[fW] === undefined) walletBalances[fW] = 0;
      if (walletBalances[tW] === undefined) walletBalances[tW] = 0;
      walletBalances[fW] -= amt;
      walletBalances[tW] += amt;
    }
  });

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
              <p style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', marginBottom: '15px' }}>กรอกรหัส OTP 6 หลักที่ส่งไปยังอีเมล <strong>{authEmail}</strong></p>
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
              <p style={{ fontSize: '13px', color: '#aaa', textAlign: 'center', marginBottom: '15px' }}>กรอกอีเมลของคุณเพื่อรับลิงก์รีเซ็ตรหัสผ่าน</p>
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
                  <img src="https://cdn-icons-png.flaticon.com/512/300/300221.png" alt="google" style={{ width: '20px' }} /> ดำเนินการต่อด้วย Google
                </button>
                <button onClick={handleFacebookLogin} style={{ padding: '12px', fontSize: '14px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', backgroundColor: '#1877F2', color: '#fff', border: 'none', fontWeight: '500' }}>
                  <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" alt="facebook" style={{ width: '20px', filter: 'brightness(0) invert(1)' }} /> ดำเนินการต่อด้วย Facebook
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

      {/* Custom Popup Modal */}
      {customAlert && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px' }}>
          <div style={{ backgroundColor: '#1e1e1e', border: '1px solid #d4af37', padding: '25px', borderRadius: '12px', width: '100%', maxWidth: '340px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
            <p style={{ color: '#fff', fontSize: '15px', marginBottom: '20px', whiteSpace: 'pre-line', lineHeight: '1.5' }}>{customAlert}</p>
            <button onClick={() => setCustomAlert(null)} style={{ backgroundColor: '#d4af37', color: '#121212', fontWeight: 'bold', border: 'none', padding: '10px 25px', borderRadius: '8px', cursor: 'pointer', width: '100%', fontSize: '15px' }}>ตกลง</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: '#1e1e1e', padding: '10px 20px', borderRadius: '12px' }}>
        <h2 className="text-gold" style={{ margin: 0 }}>My Wallet</h2>
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <div onClick={() => setShowProfileMenu(!showProfileMenu)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <img src={user.photoURL || "https://cdn-icons-png.flaticon.com/512/149/149071.png"} alt="profile" style={{ width: '38px', height: '38px', borderRadius: '50%', border: '2px solid #d4af37', objectFit: 'cover' }} referrerPolicy="no-referrer" />
          </div>
          {showProfileMenu && (
            <div style={{ position: 'absolute', top: '50px', right: '0', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', width: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 1000, overflow: 'hidden' }}>
              <div onClick={() => { setShowHistoryModal(true); setShowProfileMenu(false); }} style={{ padding: '12px 15px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid #333', fontSize: '14px' }}>📊 ประวัติการใช้งาน</div>
              <div onClick={() => { setShowExportModal(true); setShowProfileMenu(false); }} style={{ padding: '12px 15px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid #333', fontSize: '14px' }}>📄 สรุป PDF</div>
              <div onClick={() => { setShowSettingsModal(true); setShowProfileMenu(false); }} style={{ padding: '12px 15px', color: '#fff', cursor: 'pointer', borderBottom: '1px solid #333', fontSize: '14px' }}>⚙️ ตั้งค่า</div>
              <div onClick={() => { setShowLogoutModal(true); setShowProfileMenu(false); }} style={{ padding: '12px 15px', color: '#ff4d4d', cursor: 'pointer', fontSize: '14px' }}>🚪 ออกจากระบบ</div>
            </div>
          )}
        </div>
      </div>
      
      <div className="card no-print" style={{ textAlign: 'center', padding: '20px 15px' }}>
        <p style={{ margin: 0, color: '#aaa' }}>ยอดเงินคงเหลือรวมทั้งหมด</p>
        <h1 style={{ margin: '10px 0', fontSize: '36px', color: '#d4af37' }}>฿{totalBalance.toLocaleString()}</h1>
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '15px' }}>
          รายรับ {currentMonthIncome.toLocaleString()} | รายจ่าย {currentMonthExpense.toLocaleString()} (เดือนนี้)
        </div>

        {/* ส่วนแสดงบัญชี: 1 บัญชีอยู่ตรงกลาง, 2 บัญชีขึ้นไปจัดเรียงแถวละ 2 อย่างสมดุล */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: activeWallets.length === 1 ? 'minmax(160px, 240px)' : 'repeat(2, minmax(0, 1fr))', 
          justifyContent: 'center', 
          gap: '12px', 
          marginTop: '15px' 
        }}>
          {activeWallets.map(w => (
            <div key={w.id} style={{ backgroundColor: '#2a2a2a', borderLeft: `4px solid ${w.color}`, padding: '12px 15px', borderRadius: '8px', textAlign: 'left', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', boxSizing: 'border-box', width: '100%' }}>
              <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: (walletBalances[w.name] || 0) < 0 ? '#ff4d4d' : '#fff' }}>
                ฿{(walletBalances[w.name] || 0).toLocaleString()}
              </div>
            </div>
          ))}
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
              <option value="Transfer">โอนภายในบัญชี</option>
            </select>
            <select name="category" value={formData.category} onChange={handleChange}>
              {CATEGORIES[formData.type].map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {formData.type === 'Transfer' ? (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px', backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '8px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>โอนจาก (From)</div>
                <select name="fromWallet" value={formData.fromWallet} onChange={handleChange} style={{ width: '100%', marginBottom: 0 }}>
                  {activeWallets.map(w => <option key={`from-${w.id}`} value={w.name}>{w.name}</option>)}
                </select>
              </div>
              <div style={{ color: '#888', marginTop: '15px' }}>➔</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>ไปยัง (To)</div>
                <select name="toWallet" value={formData.toWallet} onChange={handleChange} style={{ width: '100%', marginBottom: 0 }}>
                  {activeWallets.map(w => <option key={`to-${w.id}`} value={w.name}>{w.name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '15px' }}>
              <select name="wallet" value={formData.wallet} onChange={handleChange}>
                {activeWallets.map(w => <option key={w.id} value={w.name}>{formData.type === 'Income' ? 'เข้าบัญชี: ' : 'หักจากบัญชี: '}{w.name}</option>)}
              </select>
            </div>
          )}

          <input type="number" name="amount" placeholder="จำนวนเงิน (บาท)" value={formData.amount} onChange={handleChange} required />
          <input type="text" name="note" placeholder="บันทึกย่อ (ถ้ามี)" value={formData.note} onChange={handleChange} />
          
          <div style={{ marginTop: '10px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: slipError ? '#ff4d4d' : '#ccc', fontWeight: slipError ? 'bold' : 'normal' }}>
              {slipError ? '* กรุณาแนบสลิปก่อนบันทึก!' : 'แนบสลิป/หลักฐาน (บังคับ)'}
            </p>
            
            <div 
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: slipError ? '2px dashed #ff4d4d' : '2px dashed #444',
                borderRadius: '10px',
                padding: '20px',
                textAlign: 'center',
                backgroundColor: '#2a2a2a',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                position: 'relative'
              }}
            >
              {isScanning && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
                  <div className="spinner" style={{ width: '30px', height: '30px', border: '3px solid rgba(212,175,55,0.3)', borderTopColor: '#d4af37', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <p style={{ color: '#d4af37', fontSize: '12px', marginTop: '10px', fontWeight: 'bold' }}>กำลังสแกนสลิปอัตโนมัติ...</p>
                  <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                </div>
              )}

              <input type="file" accept="image/*" onChange={handleImageUpload} ref={fileInputRef} style={{ display: 'none' }} />
              
              {formData.slip ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={formData.slip} alt="preview" style={{ maxHeight: '110px', borderRadius: '8px', border: '1px solid #444', display: 'block' }} />
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeSlip(); }} style={{ position: 'absolute', top: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderBottomLeftRadius: '8px', borderTopRightRadius: '8px', width: '28px', height: '28px', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>✕</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '24px' }}>📥</div>
                  <div style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '15px' }}>อัปโหลดสลิป</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>ลากไฟล์มาวาง, คลิกเลือกไฟล์, หรือกด Ctrl+V เพื่อวางภาพ</div>
                </>
              )}
            </div>
          </div>

          <button type="submit" style={{ marginTop: '15px', opacity: isScanning ? 0.5 : 1 }} disabled={isScanning}>
            {isScanning ? 'กำลังประมวลผลสลิป...' : 'บันทึกรายการ'}
          </button>
        </form>
      </div>

      {/* Modal: ตั้งค่าบัญชีธนาคาร */}
      {showSettingsModal && (
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: '#1e1e1e', width: '100%', maxWidth: '500px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '85vh', overflow: 'hidden' }}>
            <div style={{ position: 'relative', padding: '20px', borderBottom: '1px solid #333', backgroundColor: '#1e1e1e' }}>
              <h2 style={{ margin: 0, color: '#d4af37', fontSize: '20px', paddingRight: '40px' }}>ตั้งค่าและลงทะเบียนบัญชี</h2>
              <button onClick={() => setShowSettingsModal(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: '1' }}>✕</button>
            </div>
            
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <form onSubmit={handleAddCustomWallet} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', backgroundColor: '#252525', padding: '15px', borderRadius: '10px', border: '1px solid #333' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#d4af37', fontSize: '15px' }}>➕ ลงทะเบียนบัญชีใหม่สำหรับ OCR</h4>
                <input 
                  type="text" 
                  placeholder="ชื่อบัญชี/ธนาคาร (เช่น กสิกรส่วนตัว)" 
                  value={newWalletName} 
                  onChange={(e) => setNewWalletName(e.target.value)}
                  style={{ width: '100%', padding: '10px', backgroundColor: '#1e1e1e', border: '1px solid #444', color: '#fff', borderRadius: '6px', boxSizing: 'border-box' }}
                  required
                />
                <input 
                  type="text" 
                  placeholder="ชื่อเจ้าของบัญชี (เช่น นายสมชาย ใจดี)" 
                  value={newAccountName} 
                  onChange={(e) => setNewAccountName(e.target.value)}
                  style={{ width: '100%', padding: '10px', backgroundColor: '#1e1e1e', border: '1px solid #444', color: '#fff', borderRadius: '6px', boxSizing: 'border-box' }}
                />
                <input 
                  type="text" 
                  placeholder="เลขที่บัญชี (เช่น 1234567890)" 
                  value={newAccountNumber} 
                  onChange={(e) => setNewAccountNumber(e.target.value)}
                  style={{ width: '100%', padding: '10px', backgroundColor: '#1e1e1e', border: '1px solid #444', color: '#fff', borderRadius: '6px', boxSizing: 'border-box' }}
                />
                <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: '#d4af37', color: '#121212', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: '5px' }}>บันทึกบัญชีนี้</button>
              </form>

              <p style={{ color: '#aaa', fontSize: '13px', marginTop: 0, marginBottom: '12px' }}>💡 คลิกค้างที่แถวแล้วลากขึ้น-ลงเพื่อจัดลำดับบัญชี:</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {wallets.map((w, index) => (
                  <div 
                    key={w.id} 
                    draggable
                    onDragStart={(e) => handleWalletDragStart(e, index)}
                    onDragOver={handleWalletDragOver}
                    onDrop={(e) => handleWalletDrop(e, index)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '12px 15px', 
                      backgroundColor: '#2a2a2a', 
                      borderRadius: '8px', 
                      borderLeft: `4px solid ${w.color}`,
                      cursor: 'grab',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, paddingRight: '10px' }}>
                      <span style={{ color: '#666', fontSize: '16px', cursor: 'grab' }} title="ลากเพื่อสลับตำแหน่ง">⠿</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#fff', fontSize: '15px', fontWeight: 'bold' }}>{w.name}</span>
                          {w.custom && <span style={{ fontSize: '10px', backgroundColor: '#444', color: '#d4af37', padding: '2px 6px', borderRadius: '4px' }}>ลงทะเบียนแล้ว</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: '#aaa', marginTop: '3px' }}>
                          {w.accountName !== '-' && w.accountName ? `ชื่อ: ${w.accountName} ` : ''} {w.accountNumber !== '-' && w.accountNumber ? `| เลขบัญชี: ${w.accountNumber}` : ''}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {w.custom && (
                        <button type="button" onClick={() => handleDeleteCustomWallet(w.id)} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '13px' }}>ลบ</button>
                      )}
                      
                      <input 
                        type="checkbox" 
                        checked={w.active} 
                        onChange={(e) => {
                          const newWallets = [...wallets];
                          if (!e.target.checked && activeWallets.length === 1) {
                            setCustomAlert("⚠️ ต้องเปิดใช้งานอย่างน้อย 1 บัญชีครับ");
                            return;
                          }
                          newWallets[index].active = e.target.checked;
                          setWallets(newWallets);
                        }}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#d4af37' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ประวัติการใช้งาน */}
      {showHistoryModal && (
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: '#1e1e1e', width: '100%', maxWidth: '650px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '85vh', overflow: 'hidden' }}>
            <div style={{ position: 'relative', padding: '20px', borderBottom: '1px solid #333', backgroundColor: '#1e1e1e' }}>
              <h2 style={{ margin: 0, color: '#d4af37', fontSize: '20px', paddingRight: '40px' }}>ประวัติการใช้งาน</h2>
              <button onClick={() => setShowHistoryModal(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: '1' }}>✕</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button type="button" style={tabStyle('day')} onClick={() => setViewMode('day')}>รายวัน</button>
                <button type="button" style={tabStyle('week')} onClick={() => setViewMode('week')}>รายสัปดาห์</button>
                <button type="button" style={tabStyle('month')} onClick={() => setViewMode('month')}>รายเดือน</button>
              </div>

              {viewMode === 'day' && (
                <div style={{ marginBottom: '15px', backgroundColor: '#2a2a2a', padding: '12px', borderRadius: '8px', border: '1px solid #444' }}>
                  <label style={{ fontSize: '13px', color: '#aaa', display: 'block', marginBottom: '5px' }}>📅 เลือกวันที่ต้องการดู:</label>
                  <input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={{ width: '100%', padding: '10px', backgroundColor: '#1e1e1e', border: '1px solid #555', color: '#fff', borderRadius: '6px', boxSizing: 'border-box' }}/>
                </div>
              )}

              {sortedGroups.length === 0 && <p style={{ textAlign: 'center', color: '#888', padding: '20px 0' }}>ยังไม่มีรายการ</p>}
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
                              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '2px', backgroundColor: '#222', display: 'inline-block', padding: '2px 6px', borderRadius: '4px' }}>
                                💳 {item.Type === 'Transfer' ? `${item.FromWallet || 'เงินสด'} ➔ ${item.ToWallet || 'เงินสด'}` : (item.Wallet || 'เงินสด')}
                              </div>
                              <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px', marginTop: '4px' }}>{item.Note ? `${item.Note} • ` : ''} {new Date(item.Date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
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
          </div>
        </div>
      )}

      {/* Modal: ยืนยันออกจากระบบ */}
      {showLogoutModal && (
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1e1e1e', width: '90%', maxWidth: '350px', padding: '25px', borderRadius: '12px', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0, color: '#d4af37' }}>ออกจากระบบ</h3>
            <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '20px' }}>คุณต้องการออกจากระบบใช่หรือไม่?</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowLogoutModal(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#333', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>ยกเลิก</button>
              <button onClick={() => { setShowLogoutModal(false); signOut(auth); }} style={{ flex: 1, padding: '10px', backgroundColor: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>ออกจากระบบ</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ขยายรูปสลิป */}
      {viewSlipImage && (
        <div className="no-print" onClick={() => setViewSlipImage(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, cursor: 'zoom-out' }}>
          <img src={viewSlipImage} alt="slip-full" style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '12px' }} />
        </div>
      )}

      {/* Modal: สรุป PDF */}
      {showExportModal && (
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: '#1e1e1e', width: '100%', maxWidth: '600px', borderRadius: '12px', display: 'flex', flexDirection: 'column', maxHeight: '85vh', overflow: 'hidden' }}>
            <div style={{ position: 'relative', padding: '20px', borderBottom: '1px solid #333', backgroundColor: '#1e1e1e' }}>
              <h2 style={{ margin: 0, color: '#d4af37', fontSize: '20px', paddingRight: '40px' }}>ออกรายงาน PDF</h2>
              <button onClick={() => setShowExportModal(false)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: '1' }}>✕</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
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
        </div>
      )}

      {/* ส่วนพิมพ์ PDF */}
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
              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>หมวดบัญชี / บันทึก</th>
              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>สลิป</th>
              <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>จำนวนเงิน (บาท)</th>
            </tr>
          </thead>
          <tbody>
            {filteredExport.map((item, index) => (
              <tr key={index}>
                <td style={{ border: '1px solid #000', padding: '8px', verticalAlign: 'middle' }}>{new Date(item.Date).toLocaleDateString('th-TH')}</td>
                <td style={{ border: '1px solid #000', padding: '8px', verticalAlign: 'middle' }}>{item.Type === 'Income' ? 'รายรับ' : item.Type === 'Expense' ? 'รายจ่าย' : 'โอนเงิน'}</td>
                <td style={{ border: '1px solid #000', padding: '8px', verticalAlign: 'middle' }}>
                  {item.Category} {item.Note ? `(${item.Note})` : ''}
                  <br/>
                  <small style={{color: '#666'}}>
                    [{item.Type === 'Transfer' ? `${item.FromWallet || 'เงินสด'} ➔ ${item.ToWallet || 'เงินสด'}` : (item.Wallet || 'เงินสด')}]
                  </small>
                </td>
                <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                  {item.Slip ? <img src={item.Slip} alt="slip" style={{ width: '45px', height: '45px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #999' }} /> : '-'}
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