'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { obsidianService, WishlistItem } from '@/services/ObsidianFileSystemService';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');

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
      // Sort by date added, newest first (Timeline feed)
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

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-mono selection:bg-black selection:text-white">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
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
    <div className="min-h-screen bg-gray-50 text-black font-mono selection:bg-black selection:text-white p-8 max-w-2xl mx-auto">
      <header className="mb-16 pb-8 border-b border-gray-200 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase mb-1">WYQD</h1>
          <div className="text-xs text-gray-400">Vault Connected</div>
        </div>
        <div className="text-xs text-gray-500 text-right">
          Total Items: {items.length}<br/>
          Cooling: {items.filter(i => i.status === 'cooling').length}
        </div>
      </header>

      {/* Quick Input (Progressive Enhancement) */}
      <motion.form 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onSubmit={handleAddItem} 
        className="mb-16 flex gap-4"
      >
        <input 
          type="text" 
          placeholder="ITEM NAME" 
          value={newItemName}
          onChange={e => setNewItemName(e.target.value)}
          className="flex-1 bg-transparent border-b border-gray-300 pb-2 text-sm focus:outline-none focus:border-black transition-colors uppercase placeholder:text-gray-300"
        />
        <input 
          type="number" 
          placeholder="PRICE" 
          value={newItemPrice}
          onChange={e => setNewItemPrice(e.target.value)}
          className="w-24 bg-transparent border-b border-gray-300 pb-2 text-sm focus:outline-none focus:border-black transition-colors placeholder:text-gray-300"
        />
        <button type="submit" className="text-xs tracking-widest uppercase hover:text-gray-500 transition-colors">
          Capture
        </button>
      </motion.form>

      {/* Timeline Feed */}
      <div className="space-y-12 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
        {items.map((item, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
          >
            {/* Timeline dot */}
            <div className="flex items-center justify-center w-5 h-5 rounded-full border border-white bg-gray-200 group-[.is-active]:bg-black text-gray-500 group-[.is-active]:text-gray-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
            </div>
            
            {/* Minimalist Card */}
            <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.25rem)] p-4 border border-gray-200 bg-white hover:border-black transition-colors">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-sm font-bold uppercase tracking-tight">{item.name}</h3>
                <span className="text-xs text-gray-500">¥{item.price_estimated}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase tracking-widest">
                <span>{item.date_added}</span>
                <span className={\px-2 py-1 \\}>
                  {item.status} ({item.cooling_days}d)
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
