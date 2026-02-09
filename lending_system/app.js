// Configuration
const LIFF_ID = "2009040976-c4n34moj";
const SUPABASE_URL = "https://danbpunjbzksjxekyvkb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhbmJwdW5qYnprc2p4ZWt5dmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMDQ0MjgsImV4cCI6MjA4NTY4MDQyOH0._qNgd39dOTuh3Rrul5SrAaV4DKryUf9J4DuAvZA2M7Q";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


let currentUser = null;
let equipmentList = [];
let categories = [];


async function init() {
    try {
        await liff.init({ liffId: LIFF_ID, withLoginOnExternalBrowser: true });
        await liff.ready;
        if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
        }

        const profile = await liff.getProfile();
        await syncUserWithSupabase(profile);

        hideLoading();
        loadData();
        setupRealtimeSubscriptions();
    } catch (err) {
        console.error("LIFF Init Error:", err);
        Swal.fire({
            icon: 'error',
            title: 'Oops...',
            text: 'ไม่สามารถเริ่มต้น LIFF ได้: ' + err.message,
            background: '#222823',
            color: '#f4f7f5'
        });
    }
}

async function syncUserWithSupabase(liffProfile) {
    const { displayName, pictureUrl, userId } = liffProfile;


    let { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('line_userid', userId)
        .single();

    if (error && error.code === 'PGRST116') {

        const { data: newProfile, error: insertError } = await supabaseClient
            .from('profiles')
            .insert([{
                line_userid: userId,
                display_name: displayName,
                picture_url: pictureUrl
            }])
            .select()
            .single();
        profile = newProfile;
    } else {

        await supabaseClient
            .from('profiles')
            .update({ display_name: displayName, picture_url: pictureUrl })
            .eq('line_userid', userId);
    }

    if (!profile) {
        console.error("Profile sync failed: No profile data returned.");
        return;
    }

    currentUser = profile;
    document.getElementById('user-avatar').src = pictureUrl;
    document.getElementById('user-name').innerText = displayName;
    document.getElementById('user-role').innerText = profile.role === 'admin' ? 'Administrator' : 'Member';

    if (profile.role === 'admin') {
        isAdminView = true;
        document.getElementById('admin-toggle').style.display = 'none';
    } else {
        isAdminView = false;
        document.getElementById('admin-toggle').style.display = 'none';
    }

    document.getElementById('app').style.display = 'block';
}


function formatThaiDateTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }) + ' น.';
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.style.opacity = '0';
    setTimeout(() => overlay.style.display = 'none', 500);
}


async function loadData() {

    const { data: cats } = await supabaseClient.from('categories').select('*');
    categories = cats || [];


    const { data: items } = await supabaseClient
        .from('equipment')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });
    equipmentList = items || [];


    if (isAdminView) {
        document.querySelector('.search-section').style.display = 'none';
        document.getElementById('category-filters').style.display = 'none';
        await showAdminDashboard();
    } else {
        document.querySelector('.search-section').style.display = 'block';
        document.getElementById('category-filters').style.display = 'flex';
        renderCategories();
        renderEquipment(equipmentList);
    }
    await updateStats();
}

function renderCategories() {
    const container = document.getElementById('category-filters');

    container.innerHTML = '<div class="filter-chip active click-ani" onclick="filterByCategory(\'all\')">All</div>';

    categories.forEach(cat => {
        const chip = document.createElement('div');
        chip.className = 'filter-chip click-ani';


        const iconPart = cat.image_url
            ? `<img src="${cat.image_url}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.5);">`
            : (cat.icon || '📦');

        chip.innerHTML = `<div style="display: flex; align-items: center; gap: 6px;">${iconPart} <span>${cat.name}</span></div>`;

        chip.onclick = () => filterByCategory(cat.id);
        container.appendChild(chip);
    });
}

function renderEquipment(items) {
    const container = document.getElementById('equipment-container');
    container.innerHTML = '';

    items.forEach(item => {
        const isAvailable = item.status === 'available';
        const card = document.createElement('div');
        card.className = 'card-3d product-card';

        card.innerHTML = `
            <div class="card-image-container">
                 <img src="${(item.images && item.images[0]) || item.image_url || 'https://via.placeholder.com/400x300?text=' + encodeURIComponent(item.name)}" 
                     class="card-image" alt="${item.name}" loading="lazy">
                <div style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.9); padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: 700; color: var(--text-main); box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                    ${item.categories ? item.categories.name : 'General'}
                </div>
            </div>
            
            <div class="card-content">
                <h3 class="card-title">${item.name}</h3>
                
                <div class="card-details">
                    <span class="detail-tag">S/N: ${item.serial_number || '-'}</span>
                    <span class="detail-tag">Condition: ${item.condition || 'Good'}</span>
                </div>

                <div class="card-footer">
                    <div class="status-indicator ${isAvailable ? 'status-available' : 'status-unavailable'}">
                        <span class="status-dot"></span>
                        ${isAvailable ? 'พร้อมใช้งาน' : 'ไม่ว่าง'}
                    </div>
                    <button class="btn-ghost" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">View</button>
                </div>
            </div>
        `;
        card.onclick = () => showEquipmentDetail(item);
        container.appendChild(card);
    });
}

async function updateStats() {
    const available = equipmentList.filter(i => i.status === 'available').length;
    document.getElementById('stat-available').innerText = available;

    if (!currentUser) return;


    const { data: freshProfile } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (freshProfile) {
        currentUser = freshProfile;

        document.getElementById('user-name').innerText = currentUser.display_name || 'User';
        const roleEl = document.getElementById('user-role');
        roleEl.innerText = currentUser.role === 'admin' ? 'Admin' : 'Member';
        roleEl.className = `role-badge ${currentUser.role === 'admin' ? 'admin' : ''}`;
    }


    const { data: myLoans } = await supabaseClient
        .from('loans')
        .select('*')
        .eq('user_id', currentUser.id)
        .in('status', ['approved', 'overdue']);

    if (!myLoans) return;

    const now = new Date();
    let overdueCount = 0;
    let borrowingCount = 0;


    let activeOverduePenalty = 0;

    for (const loan of myLoans) {
        const endDate = new Date(loan.end_date);


        if (now > endDate && loan.status === 'approved') {
            await supabaseClient.from('loans').update({ status: 'overdue' }).eq('id', loan.id);
            loan.status = 'overdue';
        }

        if (loan.status === 'overdue') {
            overdueCount++;

            const diffMs = now - endDate;

            const daysLate = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
            activeOverduePenalty += (daysLate * 5);
        } else if (loan.status === 'approved') {
            borrowingCount++;
        }
    }

    document.getElementById('stat-borrowing').innerText = borrowingCount;
    document.getElementById('stat-overdue').innerText = overdueCount;


    const storedPenalty = currentUser.penalty_points || 0;
    const effectivePenalty = storedPenalty + activeOverduePenalty;
    const score = Math.max(0, 100 - effectivePenalty);

    const scoreEl = document.getElementById('stat-points');
    scoreEl.innerText = score;


    if (score >= 80) {
        scoreEl.style.background = 'linear-gradient(135deg, #00b894, #55efc4)';
    } else if (score >= 50) {
        scoreEl.style.background = 'linear-gradient(135deg, #fdcb6e, #ffeaa7)';
    } else {
        scoreEl.style.background = 'linear-gradient(135deg, #d63031, #ff7675)';
    }
    scoreEl.style.webkitBackgroundClip = 'text';
    scoreEl.style.webkitTextFillColor = 'transparent';


    if (overdueCount > 0) {
        Swal.fire({
            title: '⚠️ แจ้งเตือนคืนอุปกรณ์',
            html: `
                <div style="text-align: center;">
                    <p style="color: var(--danger); font-weight: 700; font-size: 1.1rem;">คุณมีอุปกรณ์ที่เกินกำหนดคืน ${overdueCount} รายการ</p>
                    <p style="color: #636e72; margin-top: 5px;">คะแนนความประพฤติของคุณลดลงเหลือ <b>${score}</b> คะแนน</p>
                    <p style="color: #636e72; font-size: 0.8rem; margin-top: 5px;">(คืนล่าช้าหัก 5 คะแนน/วัน)</p>
                </div>
            `,
            icon: 'warning',
            confirmButtonText: 'ดูรายการที่ต้องคืน',
            allowOutsideClick: false,
            confirmButtonColor: '#ff4757',
            background: '#fff'
        }).then((result) => {
            if (result.isConfirmed) {
                showMyLoans();
            }
        });
    }
}

async function showMyLoans() {
    const { data: myLoans } = await supabaseClient
        .from('loans')
        .select('*, equipment(name, images)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    const historyHtml = myLoans && myLoans.length > 0 ? myLoans.map(loan => {
        let statusBadge = '';
        let actionBtn = '';

        if (loan.status === 'approved') {
            statusBadge = '<span class="status-indicator status-available"><span class="status-dot"></span> กำลังยืม</span>';
            actionBtn = `<button onclick="returnEquipment('${loan.id}')" class="btn-3d click-ani" style="margin-top: 10px; width: 100%; font-size: 0.85rem; color: #2d3436 !important;">คืนอุปกรณ์</button>`;
        } else if (loan.status === 'pending') {
            statusBadge = '<span class="status-indicator" style="color: var(--text-light);"><span class="status-dot" style="background: var(--text-light);"></span> รออนุมัติ</span>';
        } else if (loan.status === 'returned') {
            statusBadge = '<span class="status-indicator" style="color: var(--primary);"><span class="status-dot" style="background: var(--primary);"></span> รอตรวจสอบ</span>';
        } else if (loan.status === 'overdue') {
            statusBadge = '<span class="status-indicator status-unavailable" style="color: #d63031; font-weight: bold;"><span class="status-dot" style="background: #d63031;"></span> เกินกำหนด</span>';
            actionBtn = `<button onclick="returnEquipment('${loan.id}')" class="btn-3d click-ani" style="margin-top: 10px; width: 100%; background: var(--danger); box-shadow: 0 6px 0 #b33939; color: red !important;">คืนอุปกรณ์ด่วน</button>`;
        } else {
            statusBadge = `<span class="status-indicator" style="color: var(--text-light);"><span class="status-dot" style="background: var(--text-light);"></span> ${loan.status}</span>`;
        }

        return `
            <div class="card-3d" style="padding: 1rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h3 style="font-size: 1rem; color: var(--text-main); margin: 0;">${loan.equipment.name}</h3>
                    ${statusBadge}
                </div>
                <div style="font-size: 0.8rem; color: #636e72; display: flex; flex-direction: column; gap: 4px;">
                    <span>📅 ยืมเมื่อ: ${formatThaiDateTime(loan.created_at)}</span>
                    <span style="color: #2d3436; font-weight: 600;">⏳ กำหนดคืน: ${formatThaiDateTime(loan.end_date)}</span>
                </div>
                ${actionBtn}
            </div>
        `;
    }).join('') : '<div style="text-align: center; padding: 2rem; color: var(--text-light);">ยังไม่มีประวัติการยืม</div>';

    Swal.fire({
        title: 'ประวัติการยืมของคุณ',
        html: `<div style="max-height: 50vh; overflow-y: auto; padding: 5px;">${historyHtml}</div>`,
        showConfirmButton: false,
        showCloseButton: true,
        width: 600,
        customClass: {
            container: 'active-loans-modal'
        }
    });
}

async function returnEquipment(loanId) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการคืนอุปกรณ์?',
        text: 'สถานะจะเปลี่ยนเป็น "รอตรวจสอบ" และ Admin จะยืนยันความถูกต้องอีกครั้ง',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        background: '#ffffff',
        color: '#503d42',
        confirmButtonColor: '#84c318'
    });

    if (isConfirmed) {

        const { error } = await supabaseClient.from('loans').update({ status: 'returned' }).eq('id', loanId);

        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            Swal.fire('แจ้งเรื่องคืนแล้ว', 'กรุณานำอุปกรณ์มาคืนที่จุดรับคืน และรอ Admin ยืนยัน', 'success');
            loadData();
        }
    }
}


function setupRealtimeSubscriptions() {

    supabaseClient
        .channel('equipment-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, payload => {
            console.log('Equipment Realtime change:', payload);
            loadData();
            if (isAdminView) showAdminDashboard();
        })
        .subscribe();


    supabaseClient
        .channel('loans-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, payload => {
            console.log('Loans Realtime change:', payload);
            if (isAdminView) {
                showAdminDashboard();

                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true,
                    background: '#ffffff',
                    color: '#503d42'
                });
                Toast.fire({
                    icon: 'info',
                    title: 'มีการอัปเดตรายการยืม-คืนใหม่'
                });
            } else {
                loadData();
            }
        })
        .subscribe();
}


function showEquipmentDetail(item) {
    const todayStr = new Date().toISOString().split('T')[0];

    Swal.fire({
        title: item.name,
        html: `
            <div style="text-align: left; font-family: 'Kanit';">
                <img src="${item.image_url || (item.images && item.images[0]) || 'https://via.placeholder.com/300x200?text=No+Image'}" 
                     style="width: 100%; height: 200px; object-fit: cover; border-radius: 15px; margin-bottom: 1rem; box-shadow: var(--shadow-3d);">
                <p><b>สเปค/รายละเอียด:</b> ${item.description || '-'}</p>
                <p><b>สภาพ:</b> ${item.condition}</p>
                <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 0.5rem;">เหตุผลการยืม:</label>
                <textarea id="borrow-reason" class="swal2-textarea" style="width: 100%; margin: 0; padding: 10px;" placeholder="ทำไมถึงต้องการยืม?"></textarea>
                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 10px; margin-top: 1rem;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: var(--text-light); font-size: 0.8rem;">วันที่คืน:</label>
                        <input type="date" id="return-date" class="swal2-input" min="${todayStr}" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: var(--text-light); font-size: 0.8rem;">เวลาคืน:</label>
                        <input type="time" id="return-time" class="swal2-input" style="width: 100%; margin: 0;" value="17:00">
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'ขอยืมส่งคำขอ',
        cancelButtonText: 'ยกเลิก',
        background: '#ffffff',
        color: '#503d42',
        confirmButtonColor: '#84c318',
        focusConfirm: false,
        preConfirm: () => {
            const reason = document.getElementById('borrow-reason').value;
            const date = document.getElementById('return-date').value;
            const time = document.getElementById('return-time').value;

            if (!reason || !date || !time) {
                Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
                return false;
            }

            const selectedDateTime = new Date(`${date}T${time}`);
            if (selectedDateTime < new Date()) {
                Swal.showValidationMessage('ไม่สามารถเลือกวันเวลาย้อนหลังได้');
                return false;
            }

            return { reason, returnDate: `${date}T${time}` };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            handleBorrowRequest(item, result.value);
        }
    });
}

async function handleBorrowRequest(item, data) {
    if (item.status !== 'available') {
        Swal.fire('ขออภัย!', 'อุปกรณ์นี้ไม่ว่างในขณะนี้', 'error');
        return;
    }


    const { error } = await supabaseClient.from('loans').insert([{
        user_id: currentUser.id,
        equipment_id: item.id,
        reason: data.reason,
        start_date: new Date().toISOString(),
        end_date: new Date(data.returnDate).toISOString(),
        status: 'pending'
    }]);

    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire({
            title: 'ส่งคำขอแล้ว!',
            text: 'รอ Admin อนุมัติการยืมของคุณ',
            icon: 'success',
            background: '#222823',
            color: '#f4f7f5',
            confirmButtonColor: '#00f2ff'
        });


        notifyAdminTelegram(item.name, currentUser.display_name, data.reason);
    }
}

async function notifyAdminTelegram(itemName, userName, reason, type = 'borrow') {
    try {
        const { data, error } = await supabaseClient.functions.invoke('remind-user', {
            body: { action: 'notify-admin', itemName, userName, reason, type }
        });
        if (error) throw error;
        console.log("Notification sent:", data);
    } catch (e) {
        console.error("Notification error:", e);
    }
}


function filterByCategory(categoryId) {
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => chip.classList.remove('active'));



    if (categoryId === 'all') {
        renderEquipment(equipmentList);
    } else {
        const filtered = equipmentList.filter(item => item.category_id === categoryId);
        renderEquipment(filtered);
    }
}


document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = equipmentList.filter(item =>
        item.name.toLowerCase().includes(term) ||
        (item.description && item.description.toLowerCase().includes(term))
    );
    renderEquipment(filtered);
});


let isAdminView = false;
function toggleAdminPanel() {
    isAdminView = !isAdminView;
    const btn = document.getElementById('admin-toggle');
    btn.innerText = isAdminView ? 'User View' : 'Admin Panel';
    btn.style.background = isAdminView ? 'var(--neon-blue)' : 'var(--glass)';
    btn.style.color = isAdminView ? 'var(--bg-color)' : 'white';

    loadData();
}


let adminSearchTerm = '';
let adminCurrentPage = 1;
const adminItemsPerPage = 5;


window.handleAdminSearch = function (val) {
    adminSearchTerm = val;
    adminCurrentPage = 1;
    showAdminDashboard();
}

window.changeAdminPage = function (page) {
    adminCurrentPage = page;
    showAdminDashboard();
}


window.manageCategories = async function () {
    const { data: categories } = await supabaseClient.from('categories').select('*').order('id');

    const catListHtml = categories.map(c => {
        const combinedMedia = `
            <div style="display: flex; align-items: center; gap: 8px;">
                ${c.image_url ? `<img src="${c.image_url}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 8px; border: 1px solid #eee;">` : ''}
                ${c.icon ? `<span style="font-size: 1.5rem; background: #f8f9fa; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 8px;">${c.icon}</span>` : ''}
                ${!c.image_url && !c.icon ? `<span style="font-size: 1.5rem; background: #f8f9fa; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 8px;">📦</span>` : ''}
            </div>
        `;

        return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #f0f0f0;">
            <div style="display: flex; align-items: center; gap: 12px;">
                ${combinedMedia}
                <div style="display: flex; flex-direction: column;">
                    <b style="color: var(--text-main);">${c.name}</b>
                </div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="editCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}', '${(c.icon || '').replace(/'/g, "\\'")}', '${(c.image_url || '').replace(/'/g, "\\'")}')" 
                        style="background: #fab1a0; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer;">✏️</button>
                <button onclick="deleteCategory(${c.id})" style="background: #ff7675; border: none; padding: 6px 10px; border-radius: 6px; color: white; cursor: pointer;">🗑️</button>
            </div>
        </div>
    `}).join('');

    Swal.fire({
        title: 'Manage Categories',
        html: `
            <div style="margin-bottom: 15px; background: #f9f9f9; padding: 10px; border-radius: 10px;">
                <div style="display: flex; gap: 5px; margin-bottom: 8px;">
                    <input id="new-cat-icon" placeholder="Emoji" style="width: 60px; padding: 8px; border-radius: 6px; border: 1px solid #ddd; text-align: center;">
                    <input id="new-cat-name" placeholder="Category Name" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #ddd;">
                </div>
                <div style="display: flex; gap: 5px;">
                    <input id="new-cat-img" placeholder="Image URL (Optional)" style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #ddd;">
                    <button onclick="addCategory()" class="btn-3d" style="padding: 0 15px; font-size: 0.9rem;">Add</button>
                </div>
            </div>
            <div style="max-height: 400px; overflow-y: auto; text-align: left; background: #fff; border-radius: 12px; border: 1px solid #eee;">
                ${catListHtml}
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        width: 500
    });
}

window.addCategory = async function () {
    const name = document.getElementById('new-cat-name').value;
    const icon = document.getElementById('new-cat-icon').value;
    const imageUrl = document.getElementById('new-cat-img').value;

    if (!name) return Swal.showValidationMessage('Name is required');

    const { error } = await supabaseClient
        .from('categories')
        .insert([{ name, icon, image_url: imageUrl }]);

    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        manageCategories();
        showAdminDashboard();
    }
}

window.editCategory = async function (id, currentName, currentIcon, currentImage) {
    const { value: formValues } = await Swal.fire({
        title: 'Edit Category',
        html:
            `<div style="text-align: left; margin-bottom: 5px; font-weight: bold;">Name</div>` +
            `<input id="swal-edit-name" class="swal2-input" style="margin: 0 0 10px 0;" value="${currentName}">` +
            `<div style="display: flex; gap: 10px;">` +
            `<div style="flex: 1;">` +
            `<div style="text-align: left; margin-bottom: 5px; font-weight: bold;">Emoji</div>` +
            `<input id="swal-edit-icon" class="swal2-input" style="margin: 0; text-align: center;" value="${currentIcon || ''}">` +
            `</div>` +
            `<div style="flex: 2;">` +
            `<div style="text-align: left; margin-bottom: 5px; font-weight: bold;">Image URL</div>` +
            `<input id="swal-edit-img" class="swal2-input" style="margin: 0;" value="${currentImage || ''}">` +
            `</div>` +
            `</div>`,
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => [
            document.getElementById('swal-edit-name').value,
            document.getElementById('swal-edit-icon').value,
            document.getElementById('swal-edit-img').value
        ]
    });

    if (formValues) {
        const [name, icon, imageUrl] = formValues;
        const { error } = await supabaseClient
            .from('categories')
            .update({ name, icon, image_url: imageUrl })
            .eq('id', id);

        if (!error) {
            manageCategories();
            showAdminDashboard();
        }
    }
}

window.deleteCategory = async function (id) {
    const { isConfirmed } = await Swal.fire({ title: 'Delete?', text: "สิ่งนี้อาจส่งผลกระทบต่อสินค้าที่ใช้หมวดหมู่นี้", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d63031' });
    if (isConfirmed) {
        const { error } = await supabaseClient.from('categories').delete().eq('id', id);
        if (error) Swal.fire('Error', 'Cannot delete (in use?)', 'error');
        else {
            manageCategories();
            showAdminDashboard();
        }
    }
}



window.forceCheckOverdue = async function (silent = false) {
    if (!silent) Swal.fire({ title: 'Checking Status...', didOpen: () => Swal.showLoading() });


    const { data: loans, error } = await supabaseClient.from('loans').select('*').eq('status', 'approved');
    if (error || !loans) {
        if (!silent) Swal.fire('Error', 'Cannot fetch loans', 'error');
        return;
    }

    const now = new Date().getTime();
    const updates = [];

    for (const loan of loans) {
        if (new Date(loan.end_date).getTime() < now) {
            updates.push(supabaseClient.from('loans').update({ status: 'overdue' }).eq('id', loan.id));
        }
    }

    if (updates.length > 0) {
        const results = await Promise.all(updates);
        const fail = results.find(r => r.error);

        if (fail) {
            console.error('Update Error:', fail.error);
            if (!silent) Swal.fire('Error', 'Permission Denied: Could not update status.', 'error');
        } else {
            if (!silent) {
                await Swal.fire('Success', `Marked ${updates.length} items as Overdue.`, 'success');
                showAdminDashboard();
            }
        }
    } else {
        if (!silent) Swal.fire('Info', 'All statuses are up to date.', 'info');
    }
}

async function showAdminDashboard() {

    await window.forceCheckOverdue(true);

    const container = document.getElementById('equipment-container');


    if (equipmentList.length === 0) {
        const { data: items } = await supabaseClient.from('equipment').select('*, categories(name)');
        equipmentList = items || [];
    }


    let { data: loans } = await supabaseClient
        .from('loans')
        .select(`*, profiles(display_name, picture_url, line_userid), equipment(name, image_url, images)`)
        .order('created_at', { ascending: false });
    loans = loans || [];

    let activeLoans = loans.filter(l => ['approved', 'overdue'].includes(l.status));
    if (adminSearchTerm) {
        const term = adminSearchTerm.toLowerCase();
        activeLoans = activeLoans.filter(l =>
            (l.profiles && l.profiles.display_name && l.profiles.display_name.toLowerCase().includes(term)) ||
            (l.equipment && l.equipment.name && l.equipment.name.toLowerCase().includes(term))
        );
    }


    let displayedInventory = equipmentList;
    if (adminSearchTerm) {
        const term = adminSearchTerm.toLowerCase();
        displayedInventory = equipmentList.filter(item =>
            item.name.toLowerCase().includes(term) ||
            (item.serial_number && item.serial_number.toLowerCase().includes(term)) ||
            (item.categories && item.categories.name && item.categories.name.toLowerCase().includes(term))
        );
    }


    const { data: latestCategories } = await supabaseClient.from('categories').select('*').order('id');

    const stockSummary = (latestCategories || []).map(cat => {
        const catItems = equipmentList.filter(item => Number(item.category_id) === Number(cat.id));
        const available = catItems.filter(i => i.status === 'available').length;
        return { name: cat.name, total: catItems.length, available };
    });

    container.innerHTML = `
        <div style="grid-column: 1/-1; margin-bottom: 2rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 10px;">
                <h3 style="font-size: 1.2rem; color: var(--text-main); font-weight: 800; margin: 0;">⏳ กําลังยืม & เกินกำหนด (${activeLoans.length})</h3>
                
                <div class="admin-header-controls" style="display: flex; gap: 10px; flex-grow: 1; justify-content: flex-end;">
                    <!-- Search Input -->
                    <div class="admin-search-wrapper" style="position: relative; flex-grow: 1; min-width: 200px;">
                        <input type="text" 
                               value="${adminSearchTerm}"
                               oninput="handleAdminSearch(this.value)"
                               placeholder="🔍 Search User or Device..." 
                               style="width: 100%; padding: 10px 15px; padding-left: 40px; border-radius: 12px; border: 1px solid #e1e1e1; font-size: 0.9rem; box-shadow: 0 2px 5px rgba(0,0,0,0.05); outline: none;">
                        <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 1.1rem;">🔍</span>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div class="admin-actions-group" style="display: flex; gap: 10px;">
                        <button onclick="forceCheckOverdue()" class="click-ani" 
                                style="white-space: nowrap; background: white; border: 1px solid #dfe6e9; border-radius: 12px; padding: 10px 16px; color: #2d3436; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <span>🔃</span> Check Overdue
                        </button>
                        
                        <button onclick="manageCategories()" class="click-ani" 
                                style="white-space: nowrap; background: white; border: 1px solid #dfe6e9; border-radius: 12px; padding: 10px 16px; color: #2d3436; font-weight: 600; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <span>📂</span> Categories
                        </button>
                    </div>
                </div>
            </div>

            <div class="card-3d" style="padding: 1.5rem; overflow-x: auto;">
                 ${renderActiveAndOverdueList(activeLoans)}
            </div>
        </div>

        <div style="grid-column: 1/-1; margin-bottom: 2rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem;">
            <div>
                <h3 style="margin-bottom: 1rem; font-size: 1.2rem; color: var(--text-main); font-weight: 800;">🔔 คำขอยืม (Loan Requests)</h3>
                <div id="pending-loans" class="card-3d" style="padding: 1.5rem; max-height: 400px; overflow-y: auto;">
                    ${renderLoanList(loans.filter(l => l.status === 'pending'))}
                </div>
            </div>
            <div>
                <h3 style="margin-bottom: 1rem; font-size: 1.2rem; color: var(--text-main); font-weight: 800;">📦 รอตรวจสอบคืน (Check-in)</h3>
                <div class="card-3d" style="padding: 1.5rem; max-height: 400px; overflow-y: auto;">
                    ${renderVerificationList(loans.filter(l => l.status === 'returned'))}
                </div>
            </div>
        </div>

        <div style="grid-column: 1/-1; margin-bottom: 3rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h2 style="font-weight: 800; font-size: 1.5rem; color: var(--text-main);">Inventory Insights</h2>
                <div style="display: flex; gap: 10px;">
                    <button onclick="addNewEquipment()" class="btn-3d click-ani">+ New Asset</button>
                    <button onclick="exportCSV()" class="btn-ghost click-ani">Export CSV</button>
                </div>
            </div>
            <div class="stats-grid">
                ${stockSummary.map(s => `
                    <div class="stat-card">
                        <p class="stat-label" style="text-transform: uppercase;">${s.name}</p>
                        <div style="display: flex; align-items: baseline; justify-content: center; gap: 5px; margin: 0.5rem 0;">
                            <span class="stat-value" style="font-size: 2rem;">${s.available}</span>
                            <span style="color: var(--text-light); font-size: 0.9rem;">/ ${s.total}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

<!-- Inventory Control List -->
        <div style="grid-column: 1/-1; margin-bottom: 3rem;">
            <h3 style="margin-bottom: 1rem; font-size: 1.2rem; color: var(--text-main); font-weight: 800;">Inventory Control (${displayedInventory.length})</h3>
            <div class="card-3d" style="padding: 1.5rem;">
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #f1f2f6; text-align: left;">
                                <th style="padding: 15px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase;">Asset</th>
                                <th style="padding: 15px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase;">Status</th>
                                <th style="padding: 15px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase;">Serial No.</th>
                                <th style="padding: 15px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase; text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(() => {
            const start = (adminCurrentPage - 1) * adminItemsPerPage;
            const paginatedItems = displayedInventory.slice(start, start + adminItemsPerPage);

            if (paginatedItems.length === 0) return '<tr><td colspan="4" style="text-align:center; padding: 20px;">No items found.</td></tr>';

            return paginatedItems.map(item => `
                                <tr style="border-bottom: 1px solid #f8f9fa;">
                                    <td style="padding: 15px;">
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                             <img src="${(item.images && item.images[0]) || item.image_url || 'https://via.placeholder.com/40'}" style="width: 40px; height: 30px; object-fit: cover; border-radius: 4px;">
                                             <div style="display: flex; flex-direction: column;">
                                                <span style="font-weight: 700; color: var(--text-main);">${item.name}</span>
                                                <span style="font-size: 0.8rem; color: var(--text-secondary);">${item.categories ? item.categories.name : ''}</span>
                                             </div>
                                        </div>
                                    </td>
                                    <td style="padding: 15px;">
                                        <div class="status-indicator ${item.status === 'available' ? 'status-available' : 'status-unavailable'}">
                                            <span class="status-dot"></span>
                                            ${item.status}
                                        </div>
                                    </td>
                                    <td style="padding: 15px; color: var(--text-light); font-family: monospace;">${item.serial_number || '-'}</td>
                                    <td style="padding: 15px; text-align: right;">
                                        <div style="display: flex; gap: 8px; justify-content: flex-end;">
                                            <button onclick="editEquipment('${item.id}')" class="btn-ghost click-ani" style="padding: 5px 12px; font-size: 0.75rem;">Edit</button>
                                            <button onclick="deleteEquipment('${item.id}')" class="btn-ghost click-ani" style="padding: 5px 12px; font-size: 0.75rem; color: var(--danger); border-color: var(--danger);">Delete</button>
                                        </div>
                                    </td>
                                </tr>
                                `).join('')
        })()}
                        </tbody>
                    </table>
                </div>

                <!-- Pagination Controls -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #f1f2f6;">
                    <span style="font-size: 0.9rem; color: var(--text-light);">
                        Showing ${(adminCurrentPage - 1) * adminItemsPerPage + 1} to ${Math.min(adminCurrentPage * adminItemsPerPage, displayedInventory.length)} of ${displayedInventory.length}
                    </span>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="changeAdminPage(${adminCurrentPage - 1})" 
                                class="btn-ghost" 
                                ${adminCurrentPage === 1 ? 'disabled' : ''}
                                style="font-size: 0.85rem; padding: 5px 10px; ${adminCurrentPage === 1 ? 'opacity: 0.5;' : ''}">
                            Previous
                        </button>
                        ${(() => {
            const totalPages = Math.ceil(displayedInventory.length / adminItemsPerPage);
            let pages = '';
            for (let i = 1; i <= totalPages; i++) {
                const active = i === adminCurrentPage;
                pages += `<button onclick="changeAdminPage(${i})" 
                                            class="click-ani" 
                                            style="border: none; background: ${active ? 'var(--primary)' : 'transparent'}; color: ${active ? 'white' : 'var(--text-main)'}; width: 30px; height: 30px; border-radius: 5px; font-weight: bold; cursor: pointer;">
                                            ${i}
                                          </button>`;
            }
            return pages;
        })()}
                        <button onclick="changeAdminPage(${adminCurrentPage + 1})" 
                                class="btn-ghost" 
                                ${adminCurrentPage >= Math.ceil(displayedInventory.length / adminItemsPerPage) ? 'disabled' : ''}
                                style="font-size: 0.85rem; padding: 5px 10px; ${adminCurrentPage >= Math.ceil(displayedInventory.length / adminItemsPerPage) ? 'opacity: 0.5;' : ''}">
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function editEquipment(id) {
    const item = equipmentList.find(i => i.id === id);
    if (!item) return;

    const { value: formValues } = await Swal.fire({
        title: 'แก้ไขอุปกรณ์',
        html: `
            <div style="text-align: left; font-family: 'Kanit';">
                <!-- Row 1: Name & Status -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">ชื่ออุปกรณ์</label>
                        <input id="swal-edit-name" class="swal2-input" value="${item.name}" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">สถานะ</label>
                         <select id="swal-edit-status" class="swal2-select" style="width: 100%; margin: 0; display: flex;">
                            <option value="available" ${item.status === 'available' ? 'selected' : ''}>พร้อมใช้งาน (Available)</option>
                            <option value="borrowed" ${item.status === 'borrowed' ? 'selected' : ''}>ถูกยืม (Borrowed)</option>
                            <option value="maintenance" ${item.status === 'maintenance' ? 'selected' : ''}>ซ่อมบำรุง (Maintenance)</option>
                            <option value="damaged" ${item.status === 'damaged' ? 'selected' : ''}>ชำรุด (Damaged)</option>
                         </select>
                    </div>
                </div>

                <!-- Row 2: Description -->
                <div style="margin-top: 1rem;">
                    <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">รายละเอียด</label>
                    <textarea id="swal-edit-desc" class="swal2-textarea" style="width: 100%; margin: 0; min-height: 80px;">${item.description || ''}</textarea>
                </div>

                <!-- Row 3: Image URL -->
                <div style="margin-top: 1rem;">
                    <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">URL รูปภาพ</label>
                    <input id="swal-edit-img" class="swal2-input" value="${item.image_url || ''}" placeholder="https://..." style="width: 100%; margin: 0;">
                </div>

                <!-- Row 4: S/N -->
                 <div style="margin-top: 1rem;">
                    <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">Serial Number (S/N)</label>
                    <input id="swal-edit-sn" class="swal2-input" value="${item.serial_number || ''}" style="width: 100%; margin: 0;">
                </div>
            </div>
        `,
    });

    if (formValues) {

        const updateData = {
            name: formValues.name,
            description: formValues.description,
            status: formValues.status,
            serial_number: formValues.serial_number,
            images: formValues.image_url ? [formValues.image_url] : []
        };

        const { error } = await supabaseClient
            .from('equipment')
            .update(updateData)
            .eq('id', id);

        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            Swal.fire('สำเร็จ', 'อัปเดตข้อมูลเรียบร้อยแล้ว', 'success');
            loadData();
        }
    }
}

async function deleteEquipment(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: 'การลบอุปกรณ์นี้จะทำให้ข้อมูลหายไปอย่างถาวร (รวมถึงประวัติที่เกี่ยวข้อง)',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'ลบทันที',
        cancelButtonText: 'ยกเลิก',
        background: '#ffffff',
        color: '#503d42',
        confirmButtonColor: '#84c318'
    });

    if (isConfirmed) {
        const { error } = await supabaseClient
            .from('equipment')
            .delete()
            .eq('id', id);

        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            Swal.fire('สำเร็จ', 'ลบอุปกรณ์เรียบร้อยแล้ว', 'success');
            loadData();
        }
    }
}

function renderVerificationList(loans) {
    if (loans.length === 0) return '<p style="color: var(--text-secondary); padding: 1rem;">อัปเดตข้อมูลเสร็จเรียบร้อยแล้ว</p>';
    return loans.map(loan => `
        <div class="glass-panel" style="margin-bottom: 1rem; padding: 1.25rem; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(118, 185, 0, 0.3); background: rgba(118, 185, 0, 0.05);">
            <div>
                <p style="font-weight: 800; font-size: 1rem; color: blue;">${loan.profiles.display_name}</p>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">รายการคืน: <b>${loan.equipment.name}</b></p>
            </div>
            <button onclick="verifyReturn('${loan.id}', '${loan.equipment_id}')" class="click-ani" style="padding: 12px 24px; border-radius: 50px; background: #76b900; color: white; border: none; font-size: 0.9rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(118, 185, 0, 0.4); display: flex; align-items: center; gap: 8px;">
                ✅ Verify Return
            </button>
        </div>
    `).join('');
}

async function verifyReturn(loanId, equipmentId) {

    const { data: loan, error: fetchErr } = await supabaseClient
        .from('loans')
        .select('end_date, user_id, profiles(penalty_points)')
        .eq('id', loanId)
        .single();

    if (fetchErr) {
        Swal.fire('Error', 'ไม่สามารถดึงข้อมูลการยืมได้', 'error');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการรับคืนอุปกรณ์?',
        text: 'ระบบจะตรวจสอบการคืนล่าช้าและหักคะแนนอัตโนมัติ (ถ้ามี)',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันรับคืน',
        cancelButtonText: 'ยกเลิก',
        background: '#ffffff',
        color: '#503d42',
        confirmButtonColor: '#84c318'
    });

    if (isConfirmed) {
        try {
            const now = new Date();
            const dueDate = new Date(loan.end_date);
            let penaltyMsg = '';


            const gracePeriodMs = 30 * 60 * 1000;

            if (now.getTime() > (dueDate.getTime() + gracePeriodMs)) {

                const diffMs = now - dueDate;
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // Round up to full days
                const pointsPerDay = 5;
                const penaltyToAdd = diffDays * pointsPerDay;


                const currentPenalty = loan.profiles.penalty_points || 0;
                const newPenalty = currentPenalty + penaltyToAdd;

                const { error: profileErr } = await supabaseClient
                    .from('profiles')
                    .update({ penalty_points: newPenalty })
                    .eq('id', loan.user_id);

                if (profileErr) throw profileErr;

                penaltyMsg = `<br><span style="color: red; font-weight: bold;">⚠️ คืนล่าช้า ${diffDays} วัน หักคะแนนความประพฤติ ${penaltyToAdd} แต้ม</span>`;
            } else {

                const currentPenalty = loan.profiles.penalty_points || 0;

                if (currentPenalty > 0) {
                    const recoveryPoints = 2;
                    const newPenalty = Math.max(0, currentPenalty - recoveryPoints);

                    const { error: profileErr } = await supabaseClient
                        .from('profiles')
                        .update({ penalty_points: newPenalty })
                        .eq('id', loan.user_id);

                    if (profileErr) throw profileErr;

                    if (currentPenalty !== newPenalty) {
                        penaltyMsg = `<br><span style="color: #00b894; font-weight: bold;">🌟 คืนตรงเวลา! ได้คืนคะแนนความประพฤติ ${recoveryPoints} แต้ม</span>`;
                    }
                }
            }


            const { error: loanErr } = await supabaseClient
                .from('loans')
                .update({ status: 'completed' })
                .eq('id', loanId);

            if (loanErr) throw loanErr;

            const { error: equipErr } = await supabaseClient
                .from('equipment')
                .update({ status: 'available' })
                .eq('id', equipmentId);

            if (equipErr) throw equipErr;

            Swal.fire('สำเร็จ', 'รับคืนอุปกรณ์เรียบร้อยแล้ว' + penaltyMsg, 'success');
            await loadData();
        } catch (err) {
            console.error("Verification error:", err);
            Swal.fire('ผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message, 'error');
        }
    }
}

function renderActiveLoans(loans) {
    if (loans.length === 0) return '<p style="color: var(--text-secondary); padding: 1rem;">ไม่มีใครยืมอุปกรณ์ในขณะนี้</p>';
    return loans.map(loan => `
        <div style="padding: 0.5rem; border-bottom: 1px solid var(--border);">
            <b>${loan.profiles.display_name}</b> กำลังยืม <b>${loan.equipment.name}</b>
            <p style="font-size: 0.75rem; color: var(--text-secondary);">คืนวันที่: ${formatThaiDateTime(loan.end_date)}</p>
        </div>
    `).join('');
}

function renderActiveAndOverdueList(loans) {
    if (loans.length === 0) return '<p style="color: var(--text-light); text-align: center; padding: 2rem;">No active loans.</p>';

    return `
        <table class="mobile-table" style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 2px solid #f1f2f6; text-align: left;">
                    <th style="padding: 10px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase;">User</th>
                    <th style="padding: 10px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase;">Equipment</th>
                    <th style="padding: 10px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase;">Due Date</th>
                    <th style="padding: 10px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase; text-align: center;">Status</th>
                    <th style="padding: 10px; color: var(--text-light); font-size: 0.8rem; text-transform: uppercase; text-align: center;">Notification</th>
                </tr>
            </thead>
            <tbody>
                ${loans.map(loan => {

        const isOverdue = loan.status === 'overdue' || (loan.status === 'approved' && new Date(loan.end_date) < new Date());


        if (isOverdue && loan.status !== 'overdue') {
            loan.status = 'overdue';
        }

        const userAvatar = loan.profiles.picture_url || 'https://via.placeholder.com/40';
        const itemImage = loan.equipment.image_url || ((loan.equipment.images && loan.equipment.images[0]) || 'https://via.placeholder.com/40');

        return `
                    <tr style="border-bottom: 1px solid #f8f9fa;">
                        <td data-label="User" style="padding: 12px; display: flex; align-items: center; gap: 10px;">
                            <img src="${userAvatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                            <span style="font-weight: 600; font-size: 0.9rem;">${loan.profiles.display_name}</span>
                        </td>
                        <td data-label="Equipment" style="padding: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <img src="${itemImage}" style="width: 40px; height: 30px; object-fit: cover; border-radius: 4px;">
                                <span style="font-size: 0.9rem;">${loan.equipment.name}</span>
                            </div>
                        </td>
                        <td data-label="Due Date" style="padding: 12px; font-size: 0.85rem; color: var(--text-main);">
                            ${formatThaiDateTime(loan.end_date)}
                        </td>
                        <td data-label="Status" style="padding: 12px; text-align: center;">
                            <span class="status-indicator ${isOverdue ? 'status-unavailable' : 'status-available'}" 
                                  style="justify-content: center; background: ${isOverdue ? 'rgba(255, 77, 77, 0.1)' : 'rgba(118, 185, 0, 0.1)'}; padding: 4px 8px; border-radius: 20px;">
                                <span class="status-dot"></span>
                                ${isOverdue ? 'Overdue ⚠️' : 'Active'}
                            </span>
                        </td>
                        <td data-label="SEND" style="padding: 12px; text-align: center;">
                            <div style="display: flex; gap: 8px; justify-content: center;">
                                <button onclick='sendReturnReminder(${JSON.stringify(loan).replace(/'/g, "&apos;")}, "push")' 
                                        class="click-ani" 
                                        style="border: none; background: ${isOverdue ? '#ff4757' : '#2d3436'}; color: white; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
                                    � Push
                                </button>
                                <button onclick='sendReturnReminder(${JSON.stringify(loan).replace(/'/g, "&apos;")}, "share")' 
                                        class="click-ani" 
                                        style="border: none; background: #00c851; color: white; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
                                    📤 Share
                                </button>
                            </div>
                        </td>
                    </tr>
                    `
    }).join('')}
            </tbody>
        </table>
    `;
}

async function sendReturnReminder(loan, mode = 'push') {

    const actionText = mode === 'push' ? 'ส่ง Push Notification' : 'แชร์การ์ดแจ้งเตือน';

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการแจ้งเตือน?',
        text: `ต้องการ ${actionText} หาคุณ ${loan.profiles.display_name} ใช่หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#76b900'
    });

    if (!isConfirmed) return;

    if (mode === 'push') {
        const lineUserId = loan.profiles.line_userid;

        if (!lineUserId) {
            Swal.fire('ไม่สามารถส่ง Push ได้', 'ผู้ใช้นี้ยังไม่ได้เชื่อมต่อกับ LINE (ไม่มี Line User ID)', 'warning');
            return;
        }

        try {
            Swal.fire({ title: 'กำลังส่ง Push...', text: 'กรุณารอสักครู่', allowOutsideClick: false, didOpen: () => Swal.showLoading() });


            const { data, error } = await supabaseClient.functions.invoke('remind-user', {
                body: {
                    action: 'remind-user',
                    loan: loan,
                    lineUserId: lineUserId
                }
            });

            if (error) {
                console.error("Invoke Error Object:", error);


                let errorBody = error.message;


                if (error.context && typeof error.context.json === 'function') {
                    try {
                        const errJson = await error.context.json();
                        console.log("Error JSON:", errJson);
                        if (errJson && errJson.error) {
                            errorBody = errJson.error;
                        } else {
                            errorBody = JSON.stringify(errJson);
                        }
                    } catch (parseErr) {
                        console.warn("Could not parse error JSON:", parseErr);
                    }
                }

                throw new Error(errorBody);
            }

            Swal.fire('สำเร็จ', 'ส่ง Push Notification เรียบร้อยแล้ว', 'success');

        } catch (err) {
            console.error('Push failed:', err);


            let displayMsg = err.message;


            if (displayMsg.includes('LINE_CHANNEL_ACCESS_TOKEN is missing')) {
                displayMsg = 'ไม่พบ Token ของ LINE (LINE_CHANNEL_ACCESS_TOKEN) ใน Secrets';
            } else if (displayMsg.includes('LINE API failed')) {
                displayMsg = 'เกิดข้อผิดพลาดจาก LINE API (เช่น รูปภาพไม่ถูกต้อง หรือ User ID ผิด)';
            } else if (displayMsg.includes('Invalid loan object')) {
                displayMsg = 'ข้อมูลรายการยืมไม่สมบูรณ์';
            }

            Swal.fire({
                icon: 'error',
                title: 'ส่งไม่สำเร็จ',
                text: displayMsg,
                footer: '<div style="font-size:0.8em; color:#888;">' + err.message.substring(0, 100) + '...</div>'
            });
        }
    } else {

        if (liff.isLoggedIn()) {
            sendReturnReminderLiff(loan);
        } else {
            Swal.fire('แจ้งเตือน', 'ฟีเจอร์แชร์ต้องใช้งานบนมือถือในแอป LINE เท่านั้น', 'info');
        }
    }
}

async function sendReturnReminderLiff(loan) {
    const flexMessage = {
        type: "flex",
        altText: `⚠️ แจ้งเตือนคืนอุปกรณ์: ${loan.equipment.name}`,
        contents: {
            "type": "bubble",
            "header": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "⏰ แจ้งเตือนคืนอุปกรณ์",
                        "weight": "bold",
                        "color": "#FF4444",
                        "size": "lg"
                    }
                ]
            },
            "hero": {
                "type": "image",
                "url": loan.equipment.image_url || ((loan.equipment.images && loan.equipment.images[0]) || "https://placeholder.com/300"),
                "size": "full",
                "aspectRatio": "20:13",
                "aspectMode": "cover"
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": `คุณ ${loan.profiles.display_name}`,
                        "weight": "bold",
                        "size": "md"
                    },
                    {
                        "type": "text",
                        "text": `ได้ทำการยืม: ${loan.equipment.name}`,
                        "wrap": true,
                        "margin": "sm",
                        "color": "#666666"
                    },
                    {
                        "type": "separator",
                        "margin": "md"
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "margin": "md",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "baseline",
                                "contents": [
                                    { "type": "text", "text": "กำหนดคืน:", "color": "#aaaaaa", "size": "sm", "flex": 2 },
                                    { "type": "text", "text": formatThaiDateTime(loan.end_date), "wrap": true, "color": "#111111", "size": "sm", "flex": 5 }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "baseline",
                                "margin": "sm",
                                "contents": [
                                    { "type": "text", "text": "สถานะ:", "color": "#aaaaaa", "size": "sm", "flex": 2 },
                                    { "type": "text", "text": loan.status === 'overdue' ? "🔴 เกินกำหนด" : "🟢 กำลังยืม", "wrap": true, "color": loan.status === 'overdue' ? "#FF4444" : "#76b900", "size": "sm", "flex": 5, "weight": "bold" }
                                ]
                            }
                        ]
                    },
                    {
                        "type": "text",
                        "text": "กรุณานำอุปกรณ์มาคืนที่จุดบริการ IT โดยเร็วที่สุด ขอบคุณครับ 🙏",
                        "wrap": true,
                        "margin": "lg",
                        "size": "xs",
                        "color": "#999999"
                    }
                ]
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "button",
                        "style": "primary",
                        "height": "sm",
                        "action": {
                            "type": "uri",
                            "label": "เปิดดูรายการ",
                            "uri": "https://liff.line.me/" + liff.id
                        },
                        "color": "#76b900"
                    }
                ]
            }
        }
    };

    liff.shareTargetPicker([flexMessage])
        .then(function (res) {
            if (res) {
                Swal.fire('สำเร็จ', 'ส่งแจ้งเตือนเรียบร้อยแล้ว', 'success');
            } else {

                Swal.close();
            }
        })
        .catch(function (error) {
            console.error(error);
            Swal.fire('ไม่ได้ส่ง', 'คุณยกเลิกการส่ง หรือเกิดข้อผิดพลาด', 'info');
        });
}

async function addNewEquipment() {
    const { value: formValues } = await Swal.fire({
        title: 'เพิ่มอุปกรณ์ใหม่',
        html: `
            <div style="text-align: left; font-family: 'Kanit'; display: flex; flex-direction: column; gap: 1rem;">
                <!-- Row 1: Name & Category -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">ชื่ออุปกรณ์ <span style="color: var(--danger)">*</span></label>
                        <input id="swal-name" class="swal2-input" placeholder="ระบุชื่ออุปกรณ์" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">หมวดหมู่ <span style="color: var(--danger)">*</span></label>
                        <select id="swal-cat" class="swal2-select" style="width: 100%; margin: 0; display: flex;">
                            <option value="">-- เลือกหมวดหมู่ --</option>
                            ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- Row 2: Description -->
                <div>
                    <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">รายละเอียด/สเปค</label>
                    <textarea id="swal-desc" class="swal2-textarea" placeholder="เช่น CPU, RAM, Model..." style="width: 100%; margin: 0; min-height: 80px;"></textarea>
                </div>

                <!-- Row 3: Image URL -->
                <div>
                    <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">URL รูปภาพ</label>
                    <input id="swal-img" class="swal2-input" placeholder="https://example.com/image.jpg" style="width: 100%; margin: 0;">
                </div>

                <!-- Row 4: S/N & Stock -->
                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">Serial Number (S/N)</label>
                        <input id="swal-sn" class="swal2-input" placeholder="ระบุ S/N (ถ้ามี)" style="width: 100%; margin: 0;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; color: var(--text-main); font-weight: 600;">จำนวน (Stock)</label>
                        <input id="swal-qty" type="number" class="swal2-input" value="1" min="1" style="width: 100%; margin: 0;">
                    </div>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'บันทึกข้อมูล',
        cancelButtonText: 'ยกเลิก',
        width: '600px',
        preConfirm: () => {
            const name = document.getElementById('swal-name').value;
            const category_id = document.getElementById('swal-cat').value;
            const quantity = parseInt(document.getElementById('swal-qty').value) || 1;

            if (!name || !category_id) {
                Swal.showValidationMessage('กรุณากรอกชื่อและเลือกหมวดหมู่');
                return false;
            }

            return {
                name,
                description: document.getElementById('swal-desc').value,
                image_url: document.getElementById('swal-img').value,
                serial_number: document.getElementById('swal-sn').value,
                category_id,
                quantity
            }
        }
    });

    if (formValues) {
        const itemsToInsert = [];
        for (let i = 0; i < formValues.quantity; i++) {
            itemsToInsert.push({
                name: formValues.name,
                description: formValues.description,
                images: formValues.image_url ? [formValues.image_url] : [],
                serial_number: formValues.quantity > 1 ? `${formValues.serial_number}-${i + 1}` : formValues.serial_number,
                category_id: formValues.category_id
            });
        }

        const { error } = await supabaseClient.from('equipment').insert(itemsToInsert);
        if (error) {
            Swal.fire('Error', error.message, 'error');
        } else {
            Swal.fire('สำเร็จ', `เพิ่มอุปกรณ์จำนวน ${formValues.quantity} ชิ้นเรียบร้อยแล้ว`, 'success');
            loadData();
        }
    }
}

function renderLoanList(loans) {
    if (loans.length === 0) return '<div style="text-align: center; padding: 2rem; color: var(--text-light);"><span style="font-size: 2rem;">📭</span><br>ไม่มีคำขอที่รอดำเนินการ</div>';

    return loans.map(loan => {
        const userAvatar = loan.profiles.picture_url || 'https://cdn-icons-gif.flaticon.com/18986/18986439.gif';
        const startDate = new Date(loan.start_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        const endDate = new Date(loan.end_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

        return `
        <div style="display: flex; flex-direction: column; gap: 10px; padding: 15px; border-bottom: 1px solid #f1f2f6; transition: background 0.2s;">
            <!-- Top Row: User & Date -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; gap: 10px; align-items: center;">
                    <img src="${userAvatar}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div>
                        <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${loan.profiles.display_name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light);">📅 ${startDate} - ${endDate}</div>
                    </div>
                </div>
            </div>

            <!-- Middle Row: Item & Reason -->
             <div style="background: #f8f9fa; padding: 10px; border-radius: 8px; border-left: 3px solid var(--primary);">
                <div style="font-weight: 600; color: var(--text-main); font-size: 0.9rem; margin-bottom: 4px;">📦 ${loan.equipment.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.3;">💬 "${loan.reason}"</div>
            </div>

            <!-- Bottom Row: Actions -->
            <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 5px;">
                <button onclick="approveLoan('${loan.id}', false)" 
                        class="click-ani" 
                        style="padding: 8px 16px; border-radius: 20px; background: #fff; color: #ff4757; border: 1px solid #ff4757; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
                    ปฏิเสธ
                </button>
                <button onclick="approveLoan('${loan.id}', true)" 
                        class="click-ani" 
                        style="padding: 8px 20px; border-radius: 20px; background: linear-gradient(135deg, #00b894, #00cec9); color: white; border: none; font-size: 0.8rem; font-weight: 600; box-shadow: 0 4px 6px rgba(0,184,148,0.2); cursor: pointer;">
                    อนุมัติ ✅
                </button>
            </div>
        </div>
    `}).join('');
}

async function approveLoan(loanId, isApproved) {
    const status = isApproved ? 'approved' : 'rejected';


    const { data: loan, error } = await supabaseClient
        .from('loans')
        .update({ status: status })
        .eq('id', loanId)
        .select('*, equipment_id')
        .single();

    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
        return;
    }


    if (isApproved) {
        await supabaseClient
            .from('equipment')
            .update({ status: 'borrowed' })
            .eq('id', loan.equipment_id);
    }

    Swal.fire('สำเร็จ', `ดำเนินการ ${status} เรียบร้อยแล้ว`, 'success');
    loadData();
}


async function scanEquipmentQR() {
    if (!liff.isInClient()) {
        Swal.fire('แจ้งเตือน', 'กรุณาใช้งานบนแอป LINE เพื่อสแกน QR', 'info');
        return;
    }

    try {
        const result = await liff.scanCodeV2();
        console.log("QR Result:", result.value);

        const { data: item } = await supabaseClient
            .from('equipment')
            .select('*')
            .eq('qr_code_id', result.value)
            .single();

        if (item) {
            showEquipmentDetail(item);
        } else {
            Swal.fire('ไม่พบข้อมูล', 'ไม่พบอุปกรณ์ที่ตรงกับ QR นี้', 'warning');
        }
    } catch (err) {
        console.error("Scan Error:", err);
    }
}


async function exportCSV() {
    Swal.fire({ title: 'Exporting...', didOpen: () => Swal.showLoading() });


    const { data: loans, error } = await supabaseClient
        .from('loans')
        .select('*, profiles(display_name, line_userid), equipment(name, serial_number)')
        .order('created_at', { ascending: false });

    if (error) {
        Swal.fire('Error', 'Could not fetch data for export', 'error');
        return;
    }

    if (!loans || loans.length === 0) {
        Swal.fire('Info', 'No data to export', 'info');
        return;
    }


    let csvContent = "\uFEFFID,User,Equipment,Serial No,Status,Start Date,End Date,Reason,Admin Note\n";

    loans.forEach(loan => {
        const user = loan.profiles ? loan.profiles.display_name.replace(/,/g, " ") : "Unknown";
        const item = loan.equipment ? loan.equipment.name.replace(/,/g, " ") : "Unknown";
        const serial = loan.equipment ? (loan.equipment.serial_number || "") : "";
        const sDate = new Date(loan.start_date).toISOString().split('T')[0];
        const eDate = new Date(loan.end_date).toISOString().split('T')[0];
        const reason = (loan.reason || "").replace(/,/g, " ").replace(/\n/g, " "); // Escape commas/newlines
        const note = (loan.admin_note || "").replace(/,/g, " ");

        const row = [
            loan.id,
            user,
            item,
            serial,
            loan.status,
            sDate,
            eDate,
            reason,
            note
        ].join(",");
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `lending_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.close();
}


init();
