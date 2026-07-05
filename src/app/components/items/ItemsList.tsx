import { useEffect, useRef, useState } from 'react';
import { Plus, Search, Filter, Edit, Trash2, MoreVertical, Package, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { deleteForUser, insertForUser, selectForUser, updateForUser } from '../../../lib/auditorData';
import { AppSelect } from '../common/AppSelect';

// Built-in units. Users can add their own via the "+ Add unit…" dropdown option.
const ITEM_UNIT_OPTIONS = ['Nos', 'JOB', 'HRS', 'Days', 'Kgs', 'MTR', 'SQFT', 'BAG', 'BOX', 'Pcs'];

interface Item {
  id: string;
  name: string;
  type: 'product' | 'service';
  description: string;
  hsn: string;
  unit: string;
  sellingPrice: number;
  purchasePrice: number;
  gst: number;
  stock?: number;
}

const GST_RATES = [0, 5, 12, 18, 28];
type StockFilter = 'all' | 'in-stock' | 'out-of-stock';

export function ItemsList() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'product' | 'service'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [gstFilter, setGstFilter] = useState<number[]>([]);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [minPriceFilter, setMinPriceFilter] = useState('');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');
  const [filterPos, setFilterPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const filterRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const mapItemFromDatabase = (item: any): Item => ({
    id: item.id,
    name: item.name || '',
    type: item.type || 'product',
    description: item.description || '',
    hsn: item.hsn || '',
    unit: item.unit || 'Nos',
    sellingPrice: Number(item.selling_price || 0),
    purchasePrice: Number(item.purchase_price || 0),
    gst: Number(item.gst_rate || 0),
    stock: item.stock === null || item.stock === undefined ? undefined : Number(item.stock),
  });

  const mapItemToDatabase = (item: Item) => ({
    name: item.name.trim(),
    type: item.type,
    description: item.description.trim() || null,
    hsn: item.hsn.trim() || null,
    unit: item.unit,
    selling_price: item.sellingPrice,
    purchase_price: item.purchasePrice,
    gst_rate: item.gst,
    stock: item.type === 'product' ? item.stock || 0 : null,
  });

  const loadItems = async () => {
    if (!user?.company_id) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await selectForUser<any[]>(user, 'items', 'items', () =>
      supabase
        .from('items')
        .select('id, name, type, description, hsn, unit, selling_price, purchase_price, gst_rate, stock')
        .eq('company_id', user.company_id)
        .eq('is_active', true)
        .order('name', { ascending: true })
    );

    if (error) {
      toast.error(`Could not load items: ${error.message}`);
      setItems([]);
    } else {
      setItems((data || []).map(mapItemFromDatabase));
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadItems();
  }, [user?.company_id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const inTrigger = filterRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) {
        setShowFilterPanel(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showFilterPanel) return;
    const updatePosition = () => {
      if (filterRef.current) {
        const rect = filterRef.current.getBoundingClientRect();
        setFilterPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
      }
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [showFilterPanel]);

  const availableUnits = Array.from(new Set(items.map(i => i.unit).filter(Boolean))).sort();
  const activeFilterCount =
    (gstFilter.length > 0 ? 1 : 0) +
    (stockFilter !== 'all' ? 1 : 0) +
    (unitFilter.length > 0 ? 1 : 0) +
    (minPriceFilter ? 1 : 0) +
    (maxPriceFilter ? 1 : 0);

  const clearAllFilters = () => {
    setGstFilter([]);
    setStockFilter('all');
    setUnitFilter([]);
    setMinPriceFilter('');
    setMaxPriceFilter('');
  };

  const filteredItems = items.filter(item => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(q) ||
                         item.hsn.toLowerCase().includes(q) ||
                         item.description.toLowerCase().includes(q);
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesGst = gstFilter.length === 0 || gstFilter.includes(item.gst);
    const matchesStock =
      stockFilter === 'all' ||
      (stockFilter === 'in-stock' && (item.stock ?? 0) > 0) ||
      (stockFilter === 'out-of-stock' && (item.stock ?? 0) === 0);
    const matchesUnit = unitFilter.length === 0 || unitFilter.includes(item.unit);
    const min = minPriceFilter ? parseFloat(minPriceFilter) : null;
    const max = maxPriceFilter ? parseFloat(maxPriceFilter) : null;
    const matchesPrice =
      (min === null || Number.isNaN(min) || item.sellingPrice >= min) &&
      (max === null || Number.isNaN(max) || item.sellingPrice <= max);
    return matchesSearch && matchesType && matchesGst && matchesStock && matchesUnit && matchesPrice;
  });

  const stats = {
    total: items.length,
    products: items.filter(i => i.type === 'product').length,
    services: items.filter(i => i.type === 'service').length,
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      const item = items.find((currentItem) => currentItem.id === id);
      const { error } = await deleteForUser(user, 'items', 'items', () =>
        supabase
          .from('items')
          .update({ is_active: false })
          .eq('id', id),
        { id },
        item?.name
      );

      if (error) {
        toast.error(`Could not delete item: ${error.message}`);
        return;
      }

      setItems(items.filter(item => item.id !== id));
      toast.success('Item deleted');
    }
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setShowAddModal(true);
  };

  const handleSave = async (item: Item) => {
    if (!user?.company_id) {
      toast.error('Company profile is not ready. Please refresh and try again.');
      return;
    }

    if (editingItem) {
      const values = mapItemToDatabase(item);
      const { data, error } = await updateForUser<any>(user, 'items', 'items', () =>
        supabase
          .from('items')
          .update(values)
          .eq('id', item.id)
          .select('id, name, type, description, hsn, unit, selling_price, purchase_price, gst_rate, stock')
          .single(),
        values,
        { id: item.id },
        item.name
      );

      if (error) {
        toast.error(`Could not update item: ${error.message}`);
        return;
      }

      const updatedItem = mapItemFromDatabase(data);
      setItems(items.map(i => i.id === updatedItem.id ? updatedItem : i));
      toast.success('Item updated');
    } else {
      const record = {
          company_id: user.company_id,
          ...mapItemToDatabase(item),
        };

      const { data, error } = await insertForUser<any>(user, 'items', 'items', () =>
        supabase
          .from('items')
          .insert(record)
          .select('id, name, type, description, hsn, unit, selling_price, purchase_price, gst_rate, stock')
          .single(),
        record,
        item.name
      );

      if (error) {
        toast.error(`Could not add item: ${error.message}`);
        return;
      }

      setItems([...items, mapItemFromDatabase(data)].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success('Item added');
    }
    setShowAddModal(false);
    setEditingItem(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Items & Services</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your product and service catalog</p>
        </div>
        <button
          onClick={() => {
            setEditingItem(null);
            setShowAddModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[14px] font-semibold shadow-[0_4px_18px_-4px_rgba(139,92,246,0.6)] transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Item & Service
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Items"
          value={stats.total}
          active={filterType === 'all'}
          onClick={() => setFilterType('all')}
        />
        <StatCard
          label="Products"
          value={stats.products}
          color="primary"
          active={filterType === 'product'}
          onClick={() => setFilterType('product')}
        />
        <StatCard
          label="Services"
          value={stats.services}
          color="accent"
          active={filterType === 'service'}
          onClick={() => setFilterType('service')}
        />
      </div>

      {/* Table Card */}
      <div className="bg-card border border-violet-200 dark:border-violet-400/20 rounded-xl shadow-[0_1px_2px_rgba(139,92,246,0.06)] overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-violet-100 dark:border-violet-400/10 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, HSN/SAC code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-input bg-background rounded text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => {
                if (!showFilterPanel && filterRef.current) {
                  const rect = filterRef.current.getBoundingClientRect();
                  setFilterPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
                }
                setShowFilterPanel((open) => !open);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
                showFilterPanel || activeFilterCount > 0
                  ? 'border-violet-500 dark:border-violet-400 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-200'
                  : 'border-violet-200 dark:border-violet-400/30 bg-card text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 h-5 min-w-[20px] px-1.5 inline-flex items-center justify-center rounded-full bg-violet-500 text-white text-[10px] font-bold tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {showFilterPanel && (
              <div
                ref={dropdownRef}
                className="fixed w-[340px] bg-card border border-violet-200 dark:border-violet-400/30 rounded-xl shadow-[0_12px_40px_-8px_rgba(139,92,246,0.25)] z-50 overflow-hidden"
                style={{ top: filterPos.top, right: filterPos.right }}
              >
                <div className="px-4 py-3 border-b border-violet-100 dark:border-violet-400/15 flex items-center justify-between">
                  <h4 className="text-[13px] font-semibold text-foreground">Filters</h4>
                  {activeFilterCount > 0 ? (
                    <button
                      onClick={clearAllFilters}
                      className="text-[11.5px] font-medium text-violet-600 dark:text-violet-300 hover:text-violet-700 dark:hover:text-violet-200"
                    >
                      Clear all
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowFilterPanel(false)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-violet-50 dark:hover:bg-violet-500/10"
                      aria-label="Close filters"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto kaps-modal-scroll">
                  {/* GST Rate */}
                  <div>
                    <h5 className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300 mb-2">GST Rate</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {GST_RATES.map((rate) => {
                        const selected = gstFilter.includes(rate);
                        return (
                          <button
                            key={rate}
                            type="button"
                            onClick={() =>
                              setGstFilter(selected ? gstFilter.filter((r) => r !== rate) : [...gstFilter, rate])
                            }
                            className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
                              selected
                                ? 'bg-violet-500 text-white border-violet-500'
                                : 'bg-card text-foreground border-violet-200 dark:border-violet-400/25 hover:bg-violet-50 dark:hover:bg-violet-500/10'
                            }`}
                          >
                            {rate}%
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stock Status */}
                  <div>
                    <h5 className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300 mb-2">Stock</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        { value: 'all', label: 'All' },
                        { value: 'in-stock', label: 'In stock' },
                        { value: 'out-of-stock', label: 'Out of stock' },
                      ] as { value: StockFilter; label: string }[]).map((opt) => {
                        const selected = stockFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setStockFilter(opt.value)}
                            className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
                              selected
                                ? 'bg-violet-500 text-white border-violet-500'
                                : 'bg-card text-foreground border-violet-200 dark:border-violet-400/25 hover:bg-violet-50 dark:hover:bg-violet-500/10'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Unit */}
                  {availableUnits.length > 0 && (
                    <div>
                      <h5 className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300 mb-2">Unit</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {availableUnits.map((unit) => {
                          const selected = unitFilter.includes(unit);
                          return (
                            <button
                              key={unit}
                              type="button"
                              onClick={() =>
                                setUnitFilter(selected ? unitFilter.filter((u) => u !== unit) : [...unitFilter, unit])
                              }
                              className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors ${
                                selected
                                  ? 'bg-violet-500 text-white border-violet-500'
                                  : 'bg-card text-foreground border-violet-200 dark:border-violet-400/25 hover:bg-violet-50 dark:hover:bg-violet-500/10'
                              }`}
                            >
                              {unit}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Selling Price */}
                  <div>
                    <h5 className="text-[10.5px] font-semibold tracking-[0.16em] uppercase text-violet-600 dark:text-violet-300 mb-2">Selling Price (₹)</h5>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min={0}
                        placeholder="Min"
                        value={minPriceFilter}
                        onChange={(e) => setMinPriceFilter(e.target.value)}
                        className="w-full px-3 h-9 border border-violet-200 dark:border-violet-400/30 bg-input-background rounded-lg text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Max"
                        value={maxPriceFilter}
                        onChange={(e) => setMaxPriceFilter(e.target.value)}
                        className="w-full px-3 h-9 border border-violet-200 dark:border-violet-400/30 bg-input-background rounded-lg text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/60 transition"
                      />
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-violet-100 dark:border-violet-400/15 bg-violet-50/40 dark:bg-violet-500/[0.04] flex items-center justify-between">
                  <span className="text-[11.5px] text-muted-foreground">
                    {filteredItems.length} of {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                  <button
                    onClick={() => setShowFilterPanel(false)}
                    className="h-8 px-4 rounded-full text-[12px] font-semibold text-white bg-violet-500 hover:bg-violet-400 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-violet-100 dark:bg-violet-500/15">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Item Name</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">HSN/SAC</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Unit</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Selling Price</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Purchase Price</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">GST%</th>
                <th className="px-6 py-3 text-left text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Stock</th>
                <th className="px-6 py-3 text-center text-xs font-semibold tracking-wider uppercase text-violet-600 dark:text-violet-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-100 dark:divide-violet-400/10">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Loading items...
                  </td>
                </tr>
              )}
              {!isLoading && filteredItems.map((item) => (
                <tr key={item.id} className="bg-violet-50/60 dark:bg-violet-500/[0.04] hover:bg-violet-100/70 dark:hover:bg-violet-500/[0.10] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded flex items-center justify-center flex-shrink-0 ${
                        item.type === 'product' ? 'bg-primary/10' : 'bg-accent/10'
                      }`}>
                        <Package className={`w-5 h-5 ${
                          item.type === 'product' ? 'text-primary' : 'text-accent'
                        }`} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${
                      item.type === 'product'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-accent/10 text-accent'
                    }`}>
                      {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{item.hsn}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{item.unit}</td>
                  <td className="px-6 py-4 text-sm font-medium text-foreground text-left tabular-nums">
                    ₹{item.sellingPrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground text-left tabular-nums">
                    ₹{item.purchasePrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-left">
                    <span className="inline-flex items-center px-2.5 py-1 bg-muted rounded text-xs font-medium text-foreground">
                      {item.gst}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground text-left tabular-nums">
                    {item.stock !== undefined ? item.stock : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 hover:bg-muted rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!isLoading && filteredItems.length === 0 && (
          <div className="py-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-sm text-muted-foreground">No items found</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <ItemModal
          item={editingItem}
          onClose={() => {
            setShowAddModal(false);
            setEditingItem(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  active,
  onClick
}: {
  label: string;
  value: number;
  color?: 'primary' | 'accent';
  active?: boolean;
  onClick?: () => void;
}) {
  const colorClasses = {
    primary: 'text-primary',
    accent: 'text-accent',
  };

  return (
    <button
      onClick={onClick}
      className={`bg-card border rounded-xl p-5 text-left transition-all shadow-[0_1px_2px_rgba(139,92,246,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(139,92,246,0.25)] ${
        active
          ? 'border-violet-500 dark:border-violet-400 ring-2 ring-violet-300/40 dark:ring-violet-400/25'
          : 'border-violet-300 dark:border-violet-400/30 hover:border-violet-400 dark:hover:border-violet-400/50'
      }`}
    >
      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">{label}</div>
      <div className={`text-[28px] sm:text-[32px] font-semibold tracking-tight tabular-nums ${color ? colorClasses[color] : 'text-foreground'}`}>
        {value}
      </div>
    </button>
  );
}

function ItemModal({
  item,
  onClose,
  onSave
}: {
  item: Item | null;
  onClose: () => void;
  onSave: (item: Item) => void;
}) {
  const [formData, setFormData] = useState<Item>(
    item || {
      id: '',
      name: '',
      type: 'product',
      description: '',
      hsn: '',
      unit: 'Nos',
      sellingPrice: 0,
      purchasePrice: 0,
      gst: 18,
      stock: 0
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-violet-600 dark:text-violet-300">
            {item ? 'Edit Item' : 'Add New Item'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Type Selection */}
            <div>
              <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                Item Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'product' })}
                  className={`px-4 py-3 border-2 rounded-lg transition-colors ${
                    formData.type === 'product'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <Package className="w-5 h-5 mx-auto mb-1" />
                  <div className="text-sm font-medium">Product</div>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, type: 'service', stock: undefined })}
                  className={`px-4 py-3 border-2 rounded-lg transition-colors ${
                    formData.type === 'service'
                      ? 'border-accent bg-accent/5 text-accent'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <Package className="w-5 h-5 mx-auto mb-1" />
                  <div className="text-sm font-medium">Service</div>
                </button>
              </div>
            </div>

            {/* Item Name */}
            <div>
              <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                Item Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter item name"
                className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                Description
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the item"
                className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* HSN/SAC Code & Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  HSN/SAC Code *
                </label>
                <input
                  type="text"
                  required
                  value={formData.hsn}
                  onChange={(e) => setFormData({ ...formData, hsn: e.target.value })}
                  placeholder="Enter HSN/SAC code"
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                  Unit *
                </label>
                <AppSelect
                  value={formData.unit}
                  onChange={(v) => setFormData({ ...formData, unit: v })}
                  options={formData.unit && !ITEM_UNIT_OPTIONS.includes(formData.unit) ? [formData.unit, ...ITEM_UNIT_OPTIONS] : ITEM_UNIT_OPTIONS}
                  onAddNew={() => {
                    const custom = window.prompt('Enter the unit (e.g. Ltr, Set, Roll):')?.trim();
                    if (custom) setFormData({ ...formData, unit: custom });
                  }}
                  addLabel="Add unit"
                  className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Stock */}
            <div className="grid grid-cols-2 gap-4">
              {formData.type === 'product' && (
                <div>
                  <label className="block text-sm font-medium text-violet-600 dark:text-violet-300 mb-2">
                    Opening Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock || 0}
                    onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-violet-300 dark:border-violet-400/30 bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              {item ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

