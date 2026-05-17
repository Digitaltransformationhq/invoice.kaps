import { useEffect, useState } from 'react';
import { Plus, Search, Filter, Edit, Trash2, MoreVertical, Package, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { deleteForUser, insertForUser, selectForUser, updateForUser } from '../../../lib/auditorData';

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

export function ItemsList() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'product' | 'service'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

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

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.hsn.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || item.type === filterType;
    return matchesSearch && matchesType;
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
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Item
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
      <div className="bg-white border border-border rounded-lg">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
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
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-border bg-white rounded hover:bg-muted transition-colors">
            <Filter className="w-4 h-4" />
            <span className="text-sm">Filter</span>
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Item Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">HSN/SAC</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground">Unit</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Selling Price</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Purchase Price</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground">GST%</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Stock</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    Loading items...
                  </td>
                </tr>
              )}
              {!isLoading && filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
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
                  <td className="px-6 py-4 text-sm font-medium text-foreground text-right">
                    ₹{item.sellingPrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground text-right">
                    ₹{item.purchasePrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-1 bg-muted rounded text-xs font-medium text-foreground">
                      {item.gst}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground text-right">
                    {item.stock !== undefined ? item.stock : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
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
      className={`bg-white border-2 rounded-lg p-6 text-left transition-all hover:shadow-md ${
        active ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-4xl font-bold ${color ? colorClasses[color] : 'text-foreground'}`}>
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
          <h2 className="text-lg font-semibold text-foreground">
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
              <label className="block text-sm font-medium text-foreground mb-2">
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
              <label className="block text-sm font-medium text-foreground mb-2">
                Item Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter item name"
                className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Description
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the item"
                className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            {/* HSN/SAC Code & Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  HSN/SAC Code *
                </label>
                <input
                  type="text"
                  required
                  value={formData.hsn}
                  onChange={(e) => setFormData({ ...formData, hsn: e.target.value })}
                  placeholder="Enter HSN/SAC code"
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Unit *
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option>Nos</option>
                  <option>JOB</option>
                  <option>HRS</option>
                  <option>Days</option>
                  <option>Kgs</option>
                  <option>MTR</option>
                  <option>SQFT</option>
                  <option>BAG</option>
                  <option>BOX</option>
                  <option>Pcs</option>
                </select>
              </div>
            </div>

            {/* Selling Price & Purchase Price */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Selling Price *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-8 pr-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Purchase Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-8 pr-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>

            {/* GST Rate & Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  GST Rate *
                </label>
                <select
                  value={formData.gst}
                  onChange={(e) => setFormData({ ...formData, gst: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
              {formData.type === 'product' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Opening Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.stock || 0}
                    onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-input bg-input-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
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
