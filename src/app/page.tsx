'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { obsidianService, WishlistItem } from '@/services/ObsidianFileSystemService';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [view, setView] = useState<'timeline' | 'dashboard'>('timeline');

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

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-mono selection:bg-black selection:text-white">
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8"
        >
          <h1 className="text-4xl font-bold tracking-tighter uppercase">WYQD</h1>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
            Minimalist wishlist & depreciation tracking. Connect your Obsidian Vault to continue.
          </p>
          <button 
            onClick={connectVault}
            className="px-6 py-3 bg-black text-white text-sm tracking-widest uppercase hover:bg-gray-800 transition-colors"
          >
            Connect Vault
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black font-mono selection:bg-black selection:text-white p-8 max-w-2xl mx-auto pb-24">
      <header className="mb-12 pb-8 border-b border-gray-200 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase mb-1">WYQD</h1>
          <div className="text-xs text-gray-400">Vault Connected</div>
        </div>
        
        <div className="flex gap-4 bg-gray-200/50 p-1 rounded-sm">
          <button 
            onClick={() => setView('timeline')}
            className={\px-3 py-1.5 text-[10px] uppercase tracking-widest transition-colors \\}
          >
            Timeline
          </button>
          <button 
            onClick={() => setView('dashboard')}
            className={\px-3 py-1.5 text-[10px] uppercase tracking-widest transition-colors \\}
          >
            Dashboard
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === 'timeline' && (
          <motion.div 
            key="timeline"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* Quick Input */}
            <form onSubmit={handleAddItem} className="mb-16 flex gap-4">
              <input 
                type="text" placeholder="ITEM NAME" value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                className="flex-1 bg-transparent border-b border-gray-300 pb-2 text-sm focus:outline-none focus:border-black transition-colors uppercase placeholder:text-gray-300"
              />
              <input 
                type="number" placeholder="PRICE" value={newItemPrice}
                onChange={e => setNewItemPrice(e.target.value)}
                className="w-24 bg-transparent border-b border-gray-300 pb-2 text-sm focus:outline-none focus:border-black transition-colors placeholder:text-gray-300"
              />
              <button type="submit" className="text-xs tracking-widest uppercase font-bold hover:text-gray-500 transition-colors">
                Capture
              </button>
            </form>

            {/* Timeline Feed */}
            <div className="space-y-12 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              {items.map((item, i) => {
                const { isReady, remainingDays } = getCoolingState(item);
                const isArchived = item.status === 'archived' || item.status === 'purchased';

                return (
                  <div key={item.fileName || i} className={\elative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group \\}>
                    <div className="flex items-center justify-center w-5 h-5 rounded-full border border-gray-50 bg-gray-200 group-[.is-active]:bg-black text-gray-500 group-[.is-active]:text-gray-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    </div>
                    
                    <div className={\w-[calc(100%-2.5rem)] md:w-[calc(50%-1.25rem)] p-5 border bg-white transition-all \\}>
                      <div className="flex justify-between items-start mb-4">
                        <h3 className={\	ext-sm font-bold uppercase tracking-tight \\}>{item.name}</h3>
                        <span className="text-xs text-gray-500">¥{item.price_estimated}</span>
                      </div>
                      
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-gray-400 uppercase tracking-widest">{item.date_added}</span>
                          {!isArchived && (
                            <span className={\	ext-[10px] uppercase font-bold tracking-widest \\}>
                              {isReady ? 'Ready to decide' : \Cooling: \ days left\}
                            </span>
                          )}
                          {isArchived && (
                            <span className="text-[10px] uppercase tracking-widest text-gray-400">
                              {item.status} {item.status === 'purchased' ? \- ¥\/day\ : ''}
                            </span>
                          )}
                        </div>

                        {!isArchived && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleUpdateStatus(item.fileName!, 'archived')}
                              className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-black transition-colors"
                            >
                              Drop
                            </button>
                            <button 
                              disabled={!isReady}
                              onClick={() => handleUpdateStatus(item.fileName!, 'purchased')}
                              className={\	ext-[10px] uppercase tracking-widest px-2 py-1 transition-colors \\}
                            >
                              Buy
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {items.length === 0 && (
                <div className="text-center py-20 text-xs text-gray-400 uppercase tracking-widest">
                  No desires captured yet.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === 'dashboard' && (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="p-6 border border-gray-200 bg-white">
                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Desires Defeated (Saved)</div>
                <div className="text-3xl font-bold tracking-tighter text-green-600">¥{totalSaved}</div>
                <div className="text-[10px] text-gray-400 mt-2">{archivedItems.length} items dropped</div>
              </div>
              <div className="p-6 border border-gray-200 bg-white">
                <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Currently Cooling (Blocked)</div>
                <div className="text-3xl font-bold tracking-tighter text-orange-500">¥{totalBlocked}</div>
                <div className="text-[10px] text-gray-400 mt-2">{coolingItems.length} items pending</div>
              </div>
            </div>

            <div className="p-6 border border-gray-200 bg-white">
              <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">Total Expenditures</div>
              <div className="text-4xl font-bold tracking-tighter">¥{totalSpent}</div>
              <div className="text-[10px] text-gray-400 mt-2">{purchasedItems.length} items purchased</div>
            </div>

            {purchasedItems.length > 0 && (
              <div>
                <h2 className="text-xs font-bold tracking-widest uppercase mb-4 mt-12 border-b border-gray-200 pb-2">Asset Depreciation (Daily Cost)</h2>
                <div className="space-y-2">
                  {purchasedItems.sort((a, b) => (b.date_purchased || '').localeCompare(a.date_purchased || '')).map((item, i) => (
                    <div key={i} className="flex justify-between items-center p-3 border border-gray-100 bg-white hover:border-gray-200 transition-colors">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold uppercase tracking-tight">{item.name}</span>
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest">Bought {item.date_purchased || item.date_added}</span>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-sm font-bold">¥{calculateDailyCost(item)}<span className="text-[10px] text-gray-400 font-normal"> / day</span></span>
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest">Total: ¥{item.price_estimated}</span>
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
  );
}
