import { useState, useEffect, useRef } from 'react';
import './index.css';

// นำเข้าโมดูลของ Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
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

// เริ่มต้นระบบ Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const CATEGORIES = {
  Expense: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ค่าน้ำค่าไฟ', 'สุขภาพ', 'อื่นๆ'],
  Income: ['เงินเดือน', 'รายได้เสริม', 'โบนัส', 'เงินคืน / ปันผล', 'อื่นๆ (รายรับ)']
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

  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Expense',
    category: CATEGORIES['Expense'][0],
    amount: '',
    note: '',
    slip: null 
  });

  // ตรวจสอบว่าผู้ใช้ล็อกอินอยู่หรือไม่
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // ดึงข้อมูลจาก Cloud เฉพาะของคนที่ล็อกอิน
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

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
      alert("เกิดข้อผิดพลาดในการล็อกอิน กรุณาลองใหม่ครับ");
    }
  };

  const handleLogout = () => {
    if(window.confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) {
      signOut(auth);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'type') {
      setFormData({ 
        ...formData, 
        type: value, 
        category: CATEGORIES[value][0],
        slip: null
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
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
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        setFormData(prev => ({ ...prev, slip: compressedBase64 }));
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
    } catch (error) {
      console.error("Error adding document: ", error);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    }
  };

  const handleDelete = async (id) => {
    if(window.confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
      try {
        await deleteDoc(doc(db, "transactions", id)); 
      } catch (error) {
        console.error("Error deleting document: ", error);
      }
    }
  };

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: prev[groupKey] === undefined ? false : !prev[groupKey] 
    }));
  };

  const groupedTransactions = transactions.reduce((acc, curr) => {
    let key = '';
    if (viewMode === 'day') key = getDayName(curr.Date);
    else if (viewMode === 'week') key = getWeekRange(curr.Date);
    else if (viewMode === 'month') key = getMonthName(curr.Date);

    if (!acc[key]) {
      acc[key] = { items: [], totalIncome: 0, totalExpense: 0, sortDate: curr.Date };
    }
    acc[key].items.push(curr);
    
    if (curr.Type === 'Income') acc[key].totalIncome += curr.Amount;
    else acc[key].totalExpense += curr.Amount;
    
    return acc;
  }, {});

  const sortedGroups = Object.keys(groupedTransactions).sort((a, b) => {
    return new Date(groupedTransactions[b].sortDate) - new Date(groupedTransactions[a].sortDate);
  });

  const totalBalance = transactions.reduce((acc, curr) => {
    return curr.Type === 'Income' ? acc + Number(curr.Amount) : acc - Number(curr.Amount);
  }, 0);

  const currentMonth = new Date().toISOString().slice(0, 7); 
  const monthlyTransactions = transactions.filter(t => t.Date.startsWith(currentMonth));
  
  const currentMonthIncome = monthlyTransactions
    .filter(t => t.Type === 'Income')
    .reduce((acc, curr) => acc + curr.Amount, 0);
    
  const currentMonthExpense = monthlyTransactions
    .filter(t => t.Type === 'Expense')
    .reduce((acc, curr) => acc + curr.Amount, 0);

  const tabStyle = (mode) => ({
    flex: 1,
    padding: '10px',
    backgroundColor: viewMode === mode ? '#d4af37' : '#2a2a2a',
    color: viewMode === mode ? '#121212' : '#aaa',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    borderRadius: '8px'
  });

  // --------------------------------------------------------
  // หน้าจอสำหรับตอนที่ยังไม่ได้ Login
  // --------------------------------------------------------
  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <h1 className="text-gold" style={{ fontSize: '48px', marginBottom: '10px' }}>My Wallet</h1>
        <p style={{ color: '#aaa', marginBottom: '30px' }}>ระบบบัญชีรายรับ-รายจ่ายส่วนบุคคลบน Cloud</p>
        <button onClick={handleLogin} style={{ padding: '15px 30px', fontSize: '18px', width: 'auto', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', backgroundColor: '#fff', color: '#000', border: 'none' }}>
          <img src="https://cdn-icons-png.flaticon.com/512/300/300221.png" alt="google" style={{ width: '24px' }} />
          เข้าสู่ระบบด้วย Google
        </button>
      </div>
    );
  }

  // --------------------------------------------------------
  // หน้าจอแอปพลิเคชันหลัก (หลังจาก Login แล้ว)
  // --------------------------------------------------------
  return (
    <div>
      {/* Header แสดงโปรไฟล์ผู้ใช้และปุ่ม Logout */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', backgroundColor: '#1e1e1e', padding: '10px 20px', borderRadius: '12px' }}>
        <h2 className="text-gold" style={{ margin: 0 }}>My Wallet</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={user.photoURL} alt="profile" style={{ width: '35px', height: '35px', borderRadius: '50%' }} referrerPolicy="no-referrer" />
          <button onClick={handleLogout} style={{ width: 'auto', padding: '8px 12px', fontSize: '12px', backgroundColor: '#333', color: '#ff4d4d', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>ออกจากระบบ</button>
        </div>
      </div>
      
      {/* Dashboard */}
      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, color: '#aaa' }}>ยอดเงินคงเหลือรวม</p>
        <h1 style={{ margin: '10px 0', fontSize: '36px', color: '#d4af37' }}>฿{totalBalance.toLocaleString()}</h1>
        
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
          สรุปยอดเดือนปัจจุบัน ({new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })})
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #333' }}>
          <div>
            <p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>รายรับรวม</p>
            <p className="income-text" style={{ margin: 0, fontSize: '18px' }}>+฿{currentMonthIncome.toLocaleString()}</p>
          </div>
          <div>
            <p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>ใช้ไปแล้ว</p>
            <p className="expense-text" style={{ margin: 0, fontSize: '18px' }}>-฿{currentMonthExpense.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ฟอร์มเพิ่มข้อมูล */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>เพิ่มรายการใหม่</h3>
        <form onSubmit={handleSubmit}>
          <input type="date" name="date" value={formData.date} onChange={handleChange} required lang="en-GB" />
          <div style={{ display: 'flex', gap: '10px' }}>
            <select name="type" value={formData.type} onChange={handleChange}>
              <option value="Expense">รายจ่าย</option>
              <option value="Income">รายรับ</option>
            </select>
            <select name="category" value={formData.category} onChange={handleChange}>
              {CATEGORIES[formData.type].map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <input type="number" name="amount" placeholder="จำนวนเงิน (บาท)" value={formData.amount} onChange={handleChange} required />
          <input type="text" name="note" placeholder="บันทึกย่อ (ถ้ามี)" value={formData.note} onChange={handleChange} />
          
          <div style={{ marginTop: '10px', backgroundColor: '#2a2a2a', padding: '10px', borderRadius: '8px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#ccc' }}>แนบสลิป/หลักฐาน (ถ้ามี)</p>
            <input 
              type="file" 
              accept="image/*" 
              onChange={handleImageUpload} 
              ref={fileInputRef}
              style={{ padding: '0', backgroundColor: 'transparent', border: 'none', color: '#fff' }}
            />
            
            {formData.slip && (
              <div style={{ marginTop: '15px', position: 'relative', display: 'inline-block' }}>
                <img src={formData.slip} alt="preview" style={{ maxHeight: '100px', borderRadius: '8px', border: '1px solid #444' }} />
                <button 
                  type="button" 
                  onClick={removeSlip}
                  style={{ 
                    position: 'absolute', top: '-10px', right: '-10px', 
                    backgroundColor: '#ff4d4d', color: '#fff', border: 'none', 
                    borderRadius: '50%', width: '24px', height: '24px', 
                    fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                  }}
                  title="ลบรูป"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <button type="submit" style={{ marginTop: '15px' }}>บันทึกรายการ</button>
        </form>
      </div>

      {/* การ์ดประวัติรายการ */}
      <div className="card">
        <div 
          onClick={() => setShowHistory(!showHistory)}
          style={{ 
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
            cursor: 'pointer', userSelect: 'none' 
          }}
        >
          <h3 style={{ margin: 0 }}>ประวัติการใช้งาน</h3>
          <span style={{ fontSize: '14px', color: '#d4af37', fontWeight: 'bold' }}>
            {showHistory ? '▼ ซ่อนประวัติ' : '▶ ดูประวัติ'}
          </span>
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
                  <div 
                    onClick={() => toggleGroup(groupKey)}
                    style={{ 
                      backgroundColor: '#2a2a2a', padding: '10px 15px', borderRadius: '8px', 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer', userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>{isOpen ? '▼' : '▶'}</span>
                      <span style={{ color: '#d4af37', fontWeight: 'bold' }}>{groupKey}</span>
                    </div>
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
                            
                            <div style={{ fontSize: '12px', color: '#888', marginBottom: '5px' }}>
                              {item.Note ? `${item.Note} • ` : ''} 
                              {new Date(item.Date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                            
                            {item.Slip && (
                              <img 
                                src={item.Slip} 
                                alt="slip" 
                                onClick={() => setViewSlipImage(item.Slip)}
                                style={{ 
                                  width: '50px', height: '50px', objectFit: 'cover', 
                                  borderRadius: '6px', cursor: 'pointer', border: '1px solid #444' 
                                }} 
                              />
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                            <div className={item.Type === 'Income' ? 'income-text' : 'expense-text'}>
                              {item.Type === 'Income' ? '+' : '-'}฿{Number(item.Amount).toLocaleString()}
                            </div>
                            <button 
                              onClick={() => handleDelete(item.id)}
                              style={{ width: 'auto', padding: '5px 10px', backgroundColor: '#333', color: '#ff4d4d', borderRadius: '4px', fontSize: '12px', border: 'none', cursor: 'pointer' }}
                            >
                              ลบ
                            </button>
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

      {/* Modal ป๊อปอัปดูรูปสลิปขนาดเต็ม */}
      {viewSlipImage && (
        <div 
          onClick={() => setViewSlipImage(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000, cursor: 'zoom-out'
          }}
        >
          <img 
            src={viewSlipImage} 
            alt="slip-full" 
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} 
          />
          <div style={{ position: 'absolute', top: '20px', right: '20px', color: 'white', fontSize: '24px', fontWeight: 'bold' }}>✕</div>
        </div>
      )}

    </div>
  )
}

export default App;