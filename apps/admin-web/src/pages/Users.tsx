import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../utils/api'
import type { User, ApiResponse, PaginatedResponse } from '../types'

const Users: React.FC = () => {
  const queryClient = useQueryClient()

  // 获取用户列表
  const { data: usersData, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get<ApiResponse<PaginatedResponse<User>>>('/api/v1/users/')
      return response.data.data
    }
  })

  // 删除用户
  const deleteMutation = useMutation({
    mutationFn: async (userId: number) => {
      await api.delete(`/api/v1/users/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    }
  })

  const handleDelete = (userId: number, username: string) => {
    if (window.confirm(`确定要删除用户 "${username}" 吗？`)) {
      deleteMutation.mutate(userId)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        加载用户列表失败
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
        <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          添加用户
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {usersData?.items?.map((user) => (
            <li key={user.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-700">
                        {user.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">
                      {user.username}
                    </div>
                    <div className="text-sm text-gray-500">
                      {user.email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {user.isActive ? '活跃' : '禁用'}
                  </span>
                  <button
                    onClick={() => handleDelete(user.id, user.username)}
                    className="text-red-600 hover:text-red-900 text-sm font-medium"
                    disabled={deleteMutation.isPending}
                  >
                    删除
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {usersData?.items?.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500">暂无用户数据</div>
        </div>
      )}
    </div>
  )
}

export default Users