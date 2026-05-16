'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { obsidianService, WishlistItem } from '@/services/ObsidianFileSystemService';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [view, setView] = useState<'timeline' | 'dashboard'>('timeline');
  
  // Editing state
  const [editingItemFile, setEditingItemFile] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  useEffect(() => {
    const tryAutoConnect = async () => {
      const connected = await obsidianService.initAutoConnect();
      setIsConnected(connected);
      if (connected) {
        await loadItems();
      }
      setIsInitializing(false);
    };
    tryAutoConnect();
  }, []);

  const connectVault = async () => {
    const success = await obsidianService.requestAccess();
    setIsConnected(success);
    if (success) {
      loadItems();
    }
  };

  const loadItems = async () => {
    try {
      const data = await obsidianService.getItems();
      setItems(data.sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime()));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) return;

    await obsidianService.addItem({
      name: newItemName,
      price_estimated: parseFloat(newItemPrice)
    });
    
    setNewItemName('');
    setNewItemPrice('');
    loadItems();
  };

  const handleUpdateStatus = async (fileName: string, status: 'purchased' | 'archived') => {
    await obsidianService.updateItemStatus(fileName, status);
    loadItems();
  };

  const startEditing = (item: WishlistItem) => {
    setEditingItemFile(item.fileName!);
    setEditName(item.name);
    setEditPrice(item.price_estimated.toString());
  };

  const cancelEditing = () => {
    setEditingItemFile(null);
    setEditName('');
    setEditPrice('');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemFile || !editName || !editPrice) return;
    
    await obsidianService.updateItem(editingItemFile, {
      name: editName,
      price_estimated: parseFloat(editPrice)
    });
    
    cancelEditing();
    loadItems();
  };

  const getCoolingState = (item: WishlistItem) => {
    const targetDate = new Date(item.date_added);
    targetDate.setDate(targetDate.getDate() + item.cooling_days);
    const today = new Date();
    targetDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate.getTime() - today.getTime();
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      isReady: remainingDays <= 0,
      remainingDays: remainingDays > 0 ? remainingDays : 0
    };
  };

  // Dashboard Calculations
  const coolingItems = items.filter(i => i.status === 'cooling');
  const archivedItems = items.filter(i => i.status === 'archived');
  const purchasedItems = items.filter(i => i.status === 'purchased');

  const totalBlocked = coolingItems.reduce((acc, curr) => acc + curr.price_estimated, 0);
  const totalSaved = archivedItems.reduce((acc, curr) => acc + curr.price_estimated, 0);
  const totalSpent = purchasedItems.reduce((acc, curr) => acc + curr.price_estimated, 0);

  const calculateDailyCost = (item: WishlistItem) => {
    if (!item.date_purchased) return item.price_estimated;
    const purchasedDate = new Date(item.date_purchased);
    purchasedDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = today.getTime() - purchasedDate.getTime();
    const daysOwned = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    return (item.price_estimated / daysOwned).toFixed(2);
  };

  const formatMoney = (val: number) => Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  if (isInitializing) {
    return <div className="min-h-screen bg-[#F9F9F9]"></div>;
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] flex flex-col items-center justify-center font-mono selection:bg-black selection:text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 10px, #000 10px, #000 12px, transparent 12px, transparent 16px, #000 16px, #000 20px)' }}></div>
        
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8 z-10 p-12 border border-gray-200 bg-white shadow-xl"
        >
          <div className="flex flex-col items-center">
            <h1 className="text-6xl font-bold tracking-tighter uppercase">WYQD</h1>
            <div className="h-1 w-12 bg-black mt-4 mb-2"></div>
            <div className="text-[10px] tracking-widest text-gray-400">TICKET NO. 0001</div>
          </div>
          
          <p className="text-xs text-gray-500 max-w-xs leading-relaxed uppercase tracking-wide">
            Minimalist wishlist & depreciation tracking. Connect your local Obsidian Vault to initialize the system.
          </p>
          <button 
            onClick={connectVault}
            className="w-full py-4 bg-black text-white text-xs tracking-widest uppercase hover:bg-gray-800 transition-colors border border-black"
          >
            AUTHORIZE VAULT
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9] text-black font-mono selection:bg-black selection:text-white p-4 md:p-8 max-w-3xl mx-auto pb-24">
      <div className="bg-white border border-gray-200 shadow-sm min-h-[80vh] relative">
        <div className="h-2 w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwb2x5Z29uIGZpbGw9IiNGOUY5RjkiIHBvaW50cz0iMCwwIDQsNCA4LDAgOCw4IDAsOCIvPjwvc3ZnPg==')] absolute -top-2 left-0 rotate-180"></div>
        
        <div className="p-6 md:p-12">
          <header className="mb-12 pb-8 border-b-2 border-dashed border-gray-300 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
            <div>
              <div className="text-[10px] tracking-[0.3em] text-gray-400 mb-2">PERSONAL ASSET LEDGER</div>
              <h1 className="text-4xl font-bold tracking-tighter uppercase mb-1">WYQD</h1>
              <div className="text-xs font-bold bg-black text-white px-2 py-0.5 inline-block">VAULT SYNCED</div>
            </div>
            
            <div className="w-full md:w-auto flex flex-col items-end">
              <div className="flex gap-2 bg-gray-100 p-1 rounded-sm w-full md:w-auto mb-4">
                <button 
                  onClick={() => setView('timeline')}
                  className={\lex-1 md:flex-none px-4 py-2 text-[10px] uppercase tracking-widest transition-colors \\}
                >
                  Timeline
                </button>
                <button 
                  onClick={() => setView('dashboard')}
                  className={\lex-1 md:flex-none px-4 py-2 text-[10px] uppercase tracking-widest transition-colors \\}
                >
                  Dashboard
                </button>
              </div>
              <div className="text-[10px] text-gray-500 text-right uppercase tracking-wider font-bold">
                DATE: {new Date().toISOString().split('T')[0]}
              </div>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {view === 'timeline' && (
              <motion.div 
                key="timeline"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Quick Input Form */}
                <form onSubmit={handleAddItem} className="mb-16 flex flex-col md:flex-row gap-4 bg-gray-50 p-4 border border-gray-200">
                  <div className="flex-1 flex flex-col">
                    <label className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Capture Desire</label>
                    <input 
                      type="text" placeholder="Item Name" value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      className="bg-transparent border-b border-gray-300 pb-2 text-sm focus:outline-none focus:border-black transition-colors uppercase placeholder:text-gray-300"
                    />
                  </div>
                  <div className="w-full md:w-32 flex flex-col">
                    <label className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Est. Price</label>
                    <div className="flex items-end">
                      <span className="text-gray-400 pb-2 mr-1">¥</span>
                      <input 
                        type="number" placeholder="0.00" value={newItemPrice}
                        onChange={e => setNewItemPrice(e.target.value)}
                        className="w-full bg-transparent border-b border-gray-300 pb-2 text-sm focus:outline-none focus:border-black transition-colors placeholder:text-gray-300 font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex items-end pt-4 md:pt-0">
                    <button type="submit" className="w-full md:w-auto px-6 py-2 bg-black text-white text-xs tracking-widest uppercase font-bold hover:bg-gray-800 transition-colors border border-black">
                      ADD +
                    </button>
                  </div>
                </form>

                {/* Timeline Feed */}
                <div className="space-y-6">
                  <div className="text-[10px] tracking-[0.3em] text-gray-400 border-b border-dashed border-gray-300 pb-2 mb-6">ITEMIZED LIST</div>
                  
                  {items.map((item, i) => {
                    const { isReady, remainingDays } = getCoolingState(item);
                    const isArchived = item.status === 'archived' || item.status === 'purchased';
                    const isEditing = editingItemFile === item.fileName;

                    return (
                      <motion.div 
                        key={item.fileName || i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={\p-4 md:p-6 border transition-all \\}
                      >
                        {isEditing ? (
                          <form onSubmit={saveEdit} className="flex flex-col gap-4">
                            <div className="flex flex-col md:flex-row gap-4">
                                <input 
                                  type="text" value={editName}
                                  onChange={e => setEditName(e.target.value)}
                                  className="flex-1 bg-gray-50 border border-gray-300 p-2 text-sm focus:outline-none focus:border-black transition-colors uppercase"
                                />
                                <div className="flex items-center gap-1 bg-gray-50 border border-gray-300 p-2">
                                  <span className="text-gray-400">¥</span>
                                  <input 
                                    type="number" value={editPrice}
                                    onChange={e => setEditPrice(e.target.value)}
                                    className="w-24 bg-transparent text-sm focus:outline-none focus:border-black transition-colors font-mono"
                                  />
                                </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={cancelEditing} className="px-4 py-2 border border-gray-300 text-xs uppercase tracking-widest text-gray-500 hover:text-black">CANCEL</button>
                                <button type="submit" className="px-4 py-2 bg-black text-white text-xs uppercase tracking-widest font-bold">SAVE</button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="flex flex-col md:flex-row justify-between items-start mb-4 md:mb-6 gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="text-[10px] bg-gray-200 px-1.5 py-0.5 uppercase tracking-wider font-bold">
                                    #{String(items.length - i).padStart(3, '0')}
                                  </span>
                                  <span className="text-[10px] text-gray-400 uppercase tracking-widest">{item.date_added}</span>
                                </div>
                                <h3 className={\	ext-lg font-bold uppercase tracking-tight leading-none \\}>
                                  {item.name}
                                </h3>
                              </div>
                              <div className="text-right w-full md:w-auto flex flex-row md:flex-col justify-between md:justify-start items-center md:items-end border-t border-dashed border-gray-200 pt-3 md:pt-0 md:border-none">
                                <span className="text-[10px] text-gray-400 uppercase tracking-widest block md:hidden">PRICE</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-bold tracking-tighter">¥{formatMoney(item.price_estimated)}</span>
                                    {!isArchived && (
                                        <button onClick={() => startEditing(item)} className="text-[10px] text-gray-300 hover:text-black uppercase tracking-widest underline decoration-dashed">EDIT</button>
                                    )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-t border-dotted border-gray-200 pt-4">
                              <div className="w-full md:w-auto">
                                {!isArchived && (
                                  <div className="flex items-center gap-2">
                                    <div className={\w-2 h-2 rounded-full \\}></div>
                                    <span className={\	ext-xs uppercase font-bold tracking-widest \\}>
                                      {isReady ? 'READY FOR CLEARANCE' : \COOLING: \ DAYS LEFT\}
                                    </span>
                                  </div>
                                )}
                                {isArchived && (
                                  <span className="text-xs uppercase font-bold tracking-widest text-gray-500 bg-gray-200 px-2 py-1 inline-block">
                                    STATUS: {item.status} {item.status === 'purchased' ? \| COST: ¥\/DAY\ : ''}
                                  </span>
                                )}
                              </div>

                              {!isArchived && (
                                <div className="flex gap-2 w-full md:w-auto">
                                  <button 
                                    onClick={() => handleUpdateStatus(item.fileName!, 'archived')}
                                    className="flex-1 md:flex-none px-4 py-2 border border-gray-300 text-xs uppercase tracking-widest text-gray-500 hover:text-black hover:border-black transition-all bg-white"
                                  >
                                    DROP
                                  </button>
                                  <button 
                                    disabled={!isReady}
                                    onClick={() => handleUpdateStatus(item.fileName!, 'purchased')}
                                    className={\lex-1 md:flex-none px-4 py-2 border text-xs uppercase tracking-widest font-bold transition-all \\}
                                  >
                                    BUY
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </motion.div>
                    );
                  })}
                  
                  {items.length === 0 && (
                    <div className="text-center py-24 flex flex-col items-center justify-center opacity-50">
                      <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center mb-4">
                        <span className="text-gray-300 text-2xl font-light">?</span>
                      </div>
                      <div className="text-xs text-gray-500 uppercase tracking-[0.2em]">The void is quiet.</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-2">No desires captured yet.</div>
                    </div>
                  )}
                  
                  {items.length > 0 && (
                    <div className="pt-8 flex flex-col items-center opacity-30">
                      <div className="text-[10px] tracking-[0.5em] mb-2">END OF LIST</div>
                      <div className="h-8 w-32" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #000, #000 2px, transparent 2px, transparent 4px, #000 4px, #000 5px, transparent 5px, transparent 8px)' }}></div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="text-[10px] tracking-[0.3em] text-gray-400 border-b border-dashed border-gray-300 pb-2 mb-6">FINANCIAL SUMMARY</div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2 p-8 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-widest mb-1">Total Expenditures</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-4">SUNK COSTS</div>
                        <div className="text-5xl md:text-6xl font-black tracking-tighter">¥{formatMoney(totalSpent)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-light tracking-tighter text-gray-300">{String(purchasedItems.length).padStart(2, '0')}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">ITEMS</div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 border border-gray-300 bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Currently Cooling</div>
                        <div className="text-3xl font-bold tracking-tighter text-orange-600">¥{formatMoney(totalBlocked)}</div>
                      </div>
                      <div className="text-xl font-light text-gray-400">{coolingItems.length}</div>
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase mt-4 pt-4 border-t border-dashed border-gray-300">FUNDS BLOCKED FROM IMPULSE</div>
                  </div>

                  <div className="p-6 border border-gray-300 bg-green-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Desires Defeated</div>
                        <div className="text-3xl font-bold tracking-tighter text-green-700">¥{formatMoney(totalSaved)}</div>
                      </div>
                      <div className="text-xl font-light text-gray-400">{archivedItems.length}</div>
                    </div>
                    <div className="text-[10px] text-green-600/60 uppercase mt-4 pt-4 border-t border-dashed border-green-200">SAVINGS THRU DISCIPLINE</div>
                  </div>
                </div>

                {purchasedItems.length > 0 && (
                  <div className="mt-12 pt-8 border-t-2 border-black">
                    <div className="flex justify-between items-end mb-6">
                      <h2 className="text-sm font-bold tracking-widest uppercase">Asset Depreciation Ledger</h2>
                      <div className="text-[10px] bg-black text-white px-2 py-1 uppercase tracking-widest">Daily Cost</div>
                    </div>
                    
                    <div className="space-y-4">
                      {purchasedItems.sort((a, b) => (b.date_purchased || '').localeCompare(a.date_purchased || '')).map((item, i) => (
                        <div key={i} className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border border-dashed border-gray-300 bg-white hover:bg-gray-50 transition-colors gap-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold uppercase tracking-tight">{item.name}</span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">ACQUIRED: {item.date_purchased || item.date_added}</span>
                          </div>
                          <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end border-t border-dotted border-gray-200 pt-3 md:pt-0 md:border-none">
                            <div className="text-left md:text-right">
                              <span className="text-[10px] text-gray-400 uppercase tracking-widest block">INITIAL</span>
                              <span className="text-sm font-bold text-gray-400 line-through">¥{formatMoney(item.price_estimated)}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-black uppercase tracking-widest font-bold block mb-0.5">COST / DAY</span>
                              <span className="text-lg font-black bg-yellow-100 px-2 py-0.5 inline-block">¥{calculateDailyCost(item)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="h-2 w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwb2x5Z29uIGZpbGw9IiNGOUY5RjkiIHBvaW50cz0iMCwwIDQsNCA4LDAgOCw4IDAsOCIvPjwvc3ZnPg==')] absolute -bottom-2 left-0"></div>
      </div>
    </div>
  );
}
